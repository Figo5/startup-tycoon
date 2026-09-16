import { RESEARCH, researchById } from '../data/research.js';
import { stageOrder } from '../data/stages.js';
import { mul, has } from './modifiers.js';
import { clamp } from './util.js';

export const researchSlots = (state, mods) => (has(mods, 'multi_research') ? 2 : 1)
  + (state.office.rooms.includes('lab') ? 1 : 0);

export function researchStatus(state, mods, id) {
  const r = researchById(id);
  if (!r) return { state: 'unknown' };
  if (state.research.completed.includes(id)) return { state: 'done' };
  if (state.research.active.some((a) => a.id === id)) return { state: 'active' };
  const missing = r.req.filter((q) => !state.research.completed.includes(q));
  if (missing.length) return { state: 'locked', reason: `Needs ${missing.map((q) => researchById(q).name).join(', ')}` };
  if (r.stage && stageOrder(state.company.stage) < stageOrder(r.stage)) {
    return { state: 'locked', reason: `Needs ${r.stage} stage` };
  }
  if (!has(mods, 'research')) return { state: 'locked', reason: 'Needs the Seed stage' };
  if (state.company.cash < r.cost) return { state: 'unaffordable' };
  if (state.research.active.length >= researchSlots(state, mods)) return { state: 'busy' };
  return { state: 'available' };
}

export function startResearch(state, mods, id) {
  const s = researchStatus(state, mods, id);
  if (s.state !== 'available') return { ok: false, reason: s.reason || `Cannot start (${s.state}).` };
  const r = researchById(id);
  state.company.cash -= r.cost;
  state.research.active.push({ id, progress: 0, required: r.days });
  return { ok: true };
}

export function cancelResearch(state, id) {
  const i = state.research.active.findIndex((a) => a.id === id);
  if (i < 0) return { ok: false };
  const [a] = state.research.active.splice(i, 1);
  state.company.cash += researchById(a.id).cost * 0.4 * (1 - a.progress / a.required);
  return { ok: true };
}

export function tickResearch(state, mods, days, log) {
  if (!state.research.active.length) return;
  const speed = mul(mods, 'researchSpeed');
  const done = [];
  for (const a of state.research.active) {
    a.progress += days * speed;
    if (a.progress >= a.required) done.push(a.id);
  }
  for (const id of done) {
    state.research.active = state.research.active.filter((a) => a.id !== id);
    state.research.completed.push(id);
    const r = researchById(id);
    log?.(`Research complete: ${r.name}.`, 'good');
    if (r.flags?.includes('autoscale')) state.infra.autoscale = true;
  }
}

export const allResearch = () => RESEARCH;
