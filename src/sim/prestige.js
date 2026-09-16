import { PRESTIGE_UPGRADES, prestigeById, prestigeCost, SCENARIOS } from '../data/prestige.js';
import { EXITS } from '../data/funding.js';
import { exitOptions, canExit } from './funding.js';
import { newGame, emptyMeta, metaEffects, SAVE_VERSION } from './state.js';
import { stageOrder } from '../data/stages.js';
import { clamp } from './util.js';

export const REP_DIVISOR = 1.5e8;
export const REP_EXPONENT = 0.5;

export { canExit };

export function repFor(state, mods, proceeds, exitDef) {
  const scenario = SCENARIOS.find((s) => s.id === state.scenarioId) || SCENARIOS[0];
  const fx = metaEffects(state.meta);
  const base = Math.pow(Math.max(0, proceeds) / REP_DIVISOR, REP_EXPONENT);
  return Math.floor(base * (exitDef?.repMul ?? 1) * scenario.repMul * (1 + (fx.exitRep || 0)));
}

export function exitPreview(state, mods) {
  return exitOptions(state, mods).map((o) => ({ ...o, rep: repFor(state, mods, o.proceeds, o) }));
}

/** Completes the run: returns { meta, summary }. The caller starts the next run. */
export function performExit(state, mods, exitId) {
  const opt = exitPreview(state, mods).find((o) => o.id === exitId);
  if (!opt) return { ok: false, reason: 'Unknown exit.' };
  if (!opt.available) return { ok: false, reason: opt.reason || 'Not available yet.' };
  if (!canExit(state)) return { ok: false, reason: 'No buyer at this stage.' };

  const meta = state.meta || emptyMeta();
  meta.founderRep += opt.rep;
  meta.lifetimeRep += opt.rep;
  meta.runs.unshift({
    company: state.company.name,
    exit: opt.name,
    value: opt.value,
    proceeds: opt.proceeds,
    equity: state.company.founderEquity,
    rep: opt.rep,
    days: Math.round(state.time.day),
    stage: state.company.stage,
    scenario: state.scenarioId,
    at: Date.now()
  });
  meta.runs = meta.runs.slice(0, 25);
  for (const s of SCENARIOS) {
    if (meta.runs.length >= s.unlockRuns && !meta.unlockedScenarios.includes(s.id)) meta.unlockedScenarios.push(s.id);
  }
  const ach = achievementsFor(state, opt);
  for (const a of ach) if (!meta.achievements.includes(a)) meta.achievements.push(a);

  return { ok: true, meta, summary: { ...opt, days: Math.round(state.time.day), achievements: ach } };
}

function achievementsFor(state, opt) {
  const out = [];
  if (state.company.founderEquity > 0.99) out.push('bootstrapped');
  if (opt.id === 'ipo') out.push('went_public');
  if (state.time.day < 200) out.push('fast_exit');
  if (state.employees.length >= 100) out.push('big_company');
  if (state.products.filter((p) => p.stage === 'live').length >= 5) out.push('portfolio');
  if (state.competitors.some((c) => c.acquired)) out.push('acquirer');
  return out;
}

export function prestigeLevels(meta) {
  return PRESTIGE_UPGRADES.map((up) => {
    const level = meta.upgrades[up.id] || 0;
    const maxed = level >= up.max;
    return { ...up, level, maxed, price: maxed ? null : prestigeCost(up, level) };
  });
}

export function buyPrestige(meta, id) {
  const up = prestigeById(id);
  if (!up) return { ok: false, reason: 'Unknown upgrade.' };
  const level = meta.upgrades[id] || 0;
  if (level >= up.max) return { ok: false, reason: 'Already at maximum level.' };
  const price = prestigeCost(up, level);
  if (meta.founderRep < price) return { ok: false, reason: `Needs ${price} Founder Reputation.` };
  meta.founderRep -= price;
  meta.upgrades[id] = level + 1;
  return { ok: true, level: level + 1, price };
}

export function availableScenarios(meta) {
  return SCENARIOS.filter((s) => meta.runs.length >= s.unlockRuns);
}

export function startNextRun(meta, { seed, scenarioId, companyName } = {}) {
  return newGame({ seed, meta, scenarioId, companyName });
}
