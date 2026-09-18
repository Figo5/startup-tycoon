// Product roadmaps: one initiative at a time per product.
//
// Progress is driven by product/design/engineering output - the same people who
// would be doing this work in a real company - split evenly across however many
// initiatives are running. Splitting rather than duplicating means shipping a
// third product does not silently triple roadmap speed.
//
// Cost is charged once, on start. Effects land once, on completion, and the
// initiative is recorded in `history` at the same moment so a reload cannot
// replay it.

import { ROADMAPS, ROADMAP_CATEGORIES, roadmapById } from '../data/roadmaps.js';
import { emptyRoadmap } from './state.js';
import { spendCash, runEnded } from './equity.js';
import { stageOrder } from '../data/stages.js';
import { clamp, sum } from './util.js';

/** Progress is bought with engineering, product and design effort. */
export function initiativeEffort(state, mods, wf) {
  const o = wf?.out || {};
  const raw = (o.product || 0) + (o.design || 0) * 0.6 + (o.eng || 0) * 0.35 + (o.quality || 0) * 0.5;
  return Math.max(0, raw) * (1 + (mods?.devSpeed || 0) * 0.5);
}

/**
 * The share of engineering output an active initiative takes away from the
 * product work queue. Roadmap work is not free: this is the "significant
 * engineering time" every initiative card warns about, and it is what stops a
 * roadmap from being a pure multiplier on top of the normal project loop.
 */
export const INITIATIVE_COMMIT = 0.55;

export function initiativeCommit(state) {
  return activeInitiatives(state).length ? INITIATIVE_COMMIT : 0;
}

export function ensureRoadmap(p) {
  if (!p.roadmap || typeof p.roadmap !== 'object') p.roadmap = emptyRoadmap();
  if (!Array.isArray(p.roadmap.history)) p.roadmap.history = [];
  if (typeof p.roadmap.auto !== 'boolean') p.roadmap.auto = false;
  return p.roadmap;
}

export function activeInitiatives(state) {
  return state.products.filter((p) => ensureRoadmap(p).active);
}

/**
 * How many initiatives a company can ship in one run, by stage.
 *
 * This is the single most important number in the system. Without it a long run
 * grinds through the whole board on every product and stacks every permanent
 * effect at once, which measured as a 25% cut to first-exit time. With it, the
 * roadmap is a handful of decisions per run - which is what makes choosing one
 * matter - and the total power a run can buy is bounded.
 */
export const INITIATIVE_BUDGET = { solo: 3, tiny: 4, seed: 5, growing: 7, scaleup: 9, major: 10, late: 10 };

export function initiativeBudget(state) {
  return INITIATIVE_BUDGET[state.company.stage] ?? 3;
}

export function initiativesShipped(state) {
  return sum(state.products, (p) => ensureRoadmap(p).history.length);
}

/** In-flight initiatives hold capacity too, so two products cannot overbook it. */
export function initiativesInFlight(state) {
  return activeInitiatives(state).length;
}

export function initiativesUsed(state) {
  return initiativesShipped(state) + initiativesInFlight(state);
}

export function initiativesLeft(state) {
  return Math.max(0, initiativeBudget(state) - initiativesUsed(state));
}

export function roadmapProgress(p) {
  const rm = ensureRoadmap(p);
  if (!rm.active) return null;
  const work = Math.max(1e-6, rm.active.work);
  return { ...rm.active, pct: clamp(rm.active.done / work, 0, 1), remaining: Math.max(0, work - rm.active.done) };
}

/** Cash burned per day by every initiative currently running. */
export function roadmapRunDay(state) {
  return sum(state.products, (p) => ensureRoadmap(p).active?.runDay || 0);
}

/** Which departments are too thin to run an initiative. */
export function deptShortfall(state, def) {
  const need = def.minDept || {};
  for (const [dept, n] of Object.entries(need)) {
    const have = state.employees.filter((e) => e.dept === dept).length;
    if (have < n) return { dept, need: n, have };
  }
  return null;
}

export function roadmapChoices(state, p) {
  const rm = ensureRoadmap(p);
  const order = stageOrder(state.company.stage);
  const running = rm.active ? roadmapById(rm.active.id) : null;
  const left = initiativesLeft(state);
  return ROADMAPS.map((r) => {
    const done = rm.history.includes(r.id);
    const req = r.requires || {};
    const stageOk = !req.stage || order >= stageOrder(req.stage);
    const researchOk = !req.research || state.research.completed.includes(req.research);
    const short = deptShortfall(state, r);
    const live = p.stage === 'live';
    const affordable = state.company.cash >= r.cost;
    const available = live && !done && !rm.active && stageOk && researchOk && !short && affordable && left > 0;
    return {
      ...r,
      done,
      active: rm.active?.id === r.id,
      available,
      reason: !live ? 'The product has to ship first'
        : done ? 'Already shipped on this product'
        : rm.active ? `Engineering is on ${running?.name || 'another initiative'}`
        : left <= 0 ? `This run has no roadmap capacity left (${initiativeBudget(state)} shipped or in progress)`
        : !stageOk ? `Needs the ${req.stage} stage`
        : !researchOk ? 'Needs research'
        : short ? `Needs ${short.need} in ${short.dept} (has ${short.have})`
        : !affordable ? 'Not enough cash' : null
    };
  });
}

export function startRoadmap(state, mods, productId, initiativeId) {
  if (runEnded(state)) return { ok: false, reason: 'This run has already ended.' };
  const p = state.products.find((x) => x.id === productId);
  if (!p) return { ok: false, reason: 'Unknown product.' };
  const choice = roadmapChoices(state, p).find((c) => c.id === initiativeId);
  if (!choice) return { ok: false, reason: 'Unknown initiative.' };
  if (!choice.available) return { ok: false, reason: choice.reason || 'Not available.' };
  // Re-check the run's remaining capacity against authoritative state.
  if (initiativesLeft(state) <= 0) {
    return { ok: false, reason: `This run has no roadmap capacity left (${initiativeBudget(state)} shipped or in progress).` };
  }
  // Charge once, before the initiative exists: a refused payment leaves nothing behind.
  const pay = spendCash(state, choice.cost, `roadmap:${choice.id}`);
  if (!pay.ok) return { ok: false, reason: pay.reason };
  const rm = ensureRoadmap(p);
  rm.active = {
    id: choice.id,
    name: choice.name,
    cat: choice.cat,
    started: state.time.day,
    done: 0,
    work: choice.work,
    runDay: Math.max(2, Math.round(choice.cost * 0.004))
  };
  return { ok: true, initiative: rm.active, spent: pay.spent };
}

/**
 * Abandons a running initiative. The fee is gone and nothing is recorded, so the
 * initiative can be chosen again later - restarting it costs the fee again.
 */
export function cancelRoadmap(state, productId) {
  const p = state.products.find((x) => x.id === productId);
  if (!p) return { ok: false, reason: 'Unknown product.' };
  const rm = ensureRoadmap(p);
  if (!rm.active) return { ok: false, reason: 'Nothing is in progress.' };
  const was = rm.active.name;
  rm.active = null;
  return { ok: true, cancelled: was };
}

/**
 * Applies a completed initiative to the product. One place, so the mapping from
 * "what the card promises" to "what the simulation reads" stays honest.
 */
export function applyRoadmapEffects(p, effects = {}) {
  for (const [k, v] of Object.entries(effects)) {
    switch (k) {
      case 'acqMul': case 'revMul': case 'churnMul': case 'convMul':
        p[k] = clamp((p[k] || 0) + v, -0.9, 2); break;
      case 'quality': case 'reliability': case 'security': case 'enterpriseReady':
        p[k] = clamp((p[k] || 0) + v, 0, 1); break;
      case 'techDebt':
        p.techDebt = clamp((p.techDebt || 0) + v, 0, 3); break;
      case 'infraEff':
        p.infraEff = clamp((p.infraEff || 0) + v, -0.6, 0.8); break;
      case 'supportLoadMod':
        p.supportLoadMod = (p.supportLoadMod || 0) + v; break;
      case 'marketBonus':
        p.marketBonus = (p.marketBonus || 0) + v; break;
      default: break;
    }
  }
}

function complete(state, p, log) {
  const rm = ensureRoadmap(p);
  const def = roadmapById(rm.active.id);
  if (!def) { rm.active = null; return null; }
  applyRoadmapEffects(p, def.effects);
  // Recorded in the same step as the effects, so neither can happen twice.
  if (!rm.history.includes(def.id)) rm.history.push(def.id);
  rm.active = null;
  log?.(`${p.name}: ${def.name} shipped.`, 'good');
  return def;
}

/** Conservative pick for managed departments: cheap, low-risk, unfinished. */
export function suggestRoadmap(state, p) {
  const choices = roadmapChoices(state, p).filter((c) => c.available);
  if (!choices.length) return null;
  const keep = state.company.cash * 0.5;
  const affordable = choices.filter((c) => c.cost <= keep);
  const pool = affordable.length ? affordable : [];
  if (!pool.length) return null;
  return pool.filter((c) => c.conservative).sort((a, b) => a.cost - b.cost)[0]
    || pool.sort((a, b) => a.cost - b.cost)[0];
}

export function autoStartRoadmaps(state, mods, log, all) {
  const targets = all ? state.products : [state.products.slice().sort((a, b) => b.priority - a.priority)[0]];
  for (const p of targets) {
    if (!p) continue;
    const rm = ensureRoadmap(p);
    if (rm.active || !rm.auto) continue;
    const pick = suggestRoadmap(state, p);
    if (!pick) continue;
    const r = startRoadmap(state, mods, p.id, pick.id);
    if (r.ok) log?.(`Product set the roadmap on ${p.name}: ${pick.name}.`, 'info');
  }
}

export function tickRoadmaps(state, mods, wf, days, log) {
  const running = activeInitiatives(state);
  const effort = initiativeEffort(state, mods, wf) * days;
  const share = running.length ? effort / running.length : 0;
  const completed = [];
  for (const p of running) {
    const rm = ensureRoadmap(p);
    if (!rm.active) continue;
    rm.active.done += share;
    if (rm.active.done >= rm.active.work - 1e-9) {
      const def = complete(state, p, log);
      if (def) completed.push({ product: p, initiative: def });
    }
  }
  return completed;
}

export { ROADMAP_CATEGORIES, ROADMAPS, roadmapById };
