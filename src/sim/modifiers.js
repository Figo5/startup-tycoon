import { researchById } from '../data/research.js';
import { roomById } from '../data/office.js';
import { SCENARIOS } from '../data/prestige.js';
import { STAGES, stageById, stageOrder } from '../data/stages.js';
import { metaEffects } from './state.js';

const FLAT_KEYS = new Set(['capacity', 'deskBonus', 'candidateSlots']);
const START_KEYS = new Set(['startCash', 'founderSkill', 'startReputation', 'startEngineers',
  'startResearch', 'startTier']);

/**
 * Collapses every modifier source into one flat bag of numbers plus a flag set.
 * Fractional keys are deltas: read them as (1 + mods.key).
 * Recomputed once per tick and cached on state.modCache.
 */
export function computeMods(state) {
  const m = Object.create(null);
  const flags = new Set();
  const add = (k, v) => { if (!START_KEYS.has(k) && typeof v === 'number') m[k] = (m[k] || 0) + v; };
  const merge = (obj) => { if (obj) for (const [k, v] of Object.entries(obj)) add(k, v); };

  for (const id of state.research.completed) {
    const r = researchById(id);
    if (!r) continue;
    merge(r.mods);
    for (const f of r.flags || []) flags.add(f);
  }
  for (const id of state.office.rooms) merge(roomById(id)?.effect);
  for (const b of state.boosts) if (b.until > state.time.day) merge(b.mods);
  merge(metaEffects(state.meta));
  merge((SCENARIOS.find((s) => s.id === state.scenarioId) || {}).mods);

  const stage = stageById(state.company.stage);
  // Unlocks are cumulative: everything earned at or below the current stage
  // stays unlocked. Reading only the current stage's list silently relocked
  // research (and departments, funding, ...) the moment the company grew.
  for (const s of STAGES) {
    if (s.order <= (stage?.order ?? 0)) for (const u of s.unlocks || []) flags.add(u);
  }
  for (const s of state.flags.unlocked) flags.add(s);
  if (state.infra.autoscale) flags.add('autoscale');

  m.flags = flags;
  m.stageMarketMul = stage?.marketMul ?? 1;
  m.stageValuationMul = stage?.valuationMul ?? 1;
  m.stageOrder = stage?.order ?? 0;
  return m;
}

export const mul = (mods, key, floor = -0.9) => 1 + Math.max(floor, mods[key] || 0);
export const flat = (mods, key) => mods[key] || 0;
export const has = (mods, flag) => mods.flags.has(flag);
export { FLAT_KEYS, stageOrder };

export function addBoost(state, id, mods, days, label) {
  const existing = state.boosts.find((b) => b.id === id);
  if (existing) { existing.until = Math.max(existing.until, state.time.day + days); existing.mods = mods; return; }
  state.boosts.push({ id, mods, until: state.time.day + days, label: label || id });
}

export function pruneBoosts(state) {
  state.boosts = state.boosts.filter((b) => b.until > state.time.day);
}
