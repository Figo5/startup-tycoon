// Company goals: three on offer, one active, completed exactly once.
//
// Rewards are deliberately modest and, where they touch the economy, they land
// as permanent small modifier deltas on the goal-tech bag rather than as a big
// cash injection - a goal should change what you do next, not skip a stage.

import { GOALS, OFFERED_GOALS, goalById } from '../data/goals.js';
import { emptyGoals, normalizeMeta } from './state.js';
import { stageOrder } from '../data/stages.js';
import { pick } from './rng.js';
import { clamp } from './util.js';

export function ensureGoals(state) {
  if (!state.goals || typeof state.goals !== 'object') state.goals = emptyGoals();
  const g = state.goals;
  if (!Array.isArray(g.offered)) g.offered = [];
  if (!Array.isArray(g.completed)) g.completed = [];
  if (!g.tech || typeof g.tech !== 'object') g.tech = {};
  if (!Number.isFinite(g.track)) g.track = 0;
  if (typeof g.taken !== 'number') g.taken = 0;
  return g;
}

export function goalEligible(state, def) {
  const g = ensureGoals(state);
  if (g.completed.includes(def.id)) return false;
  if (g.active?.id === def.id) return false;
  return stageOrder(state.company.stage) >= stageOrder(def.unlock);
}

export function goalProgress(state, def) {
  const p = def.progress ? def.progress(state) : { have: 0, need: 1 };
  const need = Math.max(1e-9, p.need);
  return { have: p.have, need: p.need, pct: clamp(p.have / need, 0, 1) };
}

/** Completion is `ready` when the goal defines one, otherwise "progress is full". */
export function goalReady(state, def) {
  if (def.ready) return !!def.ready(state);
  const p = def.progress ? def.progress(state) : null;
  if (!p) return false;
  return p.have >= p.need;
}

/**
 * Keeps three goals on offer. Never removes the active one, never re-offers a
 * completed one, and only draws from goals reachable at this stage.
 */
export function refreshOfferedGoals(state) {
  const g = ensureGoals(state);
  g.offered = g.offered.filter((id) => {
    const def = goalById(id);
    return def && goalEligible(state, def) && (!g.active || g.active.id !== id);
  });
  let guard = 0;
  while (g.offered.length < OFFERED_GOALS && guard++ < 30) {
    const pool = GOALS.filter((def) => goalEligible(state, def) && !g.offered.includes(def.id));
    if (!pool.length) break;
    const still = pool.filter((def) => {
      const p = def.progress ? def.progress(state) : { have: 0, need: 1 };
      return p.have < p.need;
    });
    const from = still.length ? still : pool;
    g.offered.push(pick(state.rng, from).id);
  }
  return g.offered;
}

export function offeredGoals(state) {
  return ensureGoals(state).offered.map((id) => goalById(id)).filter(Boolean);
}

export function acceptGoal(state, id) {
  if (state.exitResult) return { ok: false, reason: 'This run has already ended.' };
  const def = goalById(id);
  if (!def) return { ok: false, reason: 'Unknown goal.' };
  const g = ensureGoals(state);
  if (g.completed.includes(id)) return { ok: false, reason: 'Already completed.' };
  if (g.active?.id === id) return { ok: false, reason: 'Already active.' };
  if (!goalEligible(state, def)) return { ok: false, reason: `Not available until the ${def.unlock} stage.` };
  // Accepting a goal while another is active is a switch, and it is free. There
  // is still only ever one active goal, and its progress counter restarts.
  const switchedFrom = g.active?.id || null;
  g.active = { id, started: state.time.day };
  g.track = 0;
  g.taken += 1;
  return { ok: true, goal: def, switchedFrom };
}

/** Switching goals is free and painless: no streaks to break, nothing to lose. */
export function abandonGoal(state) {
  const g = ensureGoals(state);
  if (!g.active) return { ok: false, reason: 'No goal is active.' };
  const was = goalById(g.active.id);
  g.active = null;
  g.track = 0;
  return { ok: true, abandoned: was };
}

export function grantReward(state, def) {
  const r = def.reward || {};
  const g = ensureGoals(state);
  const granted = {};
  if (r.cash) { state.company.cash += r.cash; granted.cash = r.cash; }
  if (r.reputation) {
    state.company.reputation = clamp(state.company.reputation + r.reputation, 0.2, 60);
    granted.reputation = r.reputation;
  }
  if (r.founderRep) {
    const meta = normalizeMeta(state.meta);
    meta.founderRep += r.founderRep;
    meta.lifetimeRep += r.founderRep;
    granted.founderRep = r.founderRep;
  }
  if (r.tech) {
    for (const [k, v] of Object.entries(r.tech)) g.tech[k] = (g.tech[k] || 0) + v;
    granted.tech = { ...r.tech };
  }
  return granted;
}

export function tickGoals(state, mods, days, log) {
  const g = ensureGoals(state);
  refreshOfferedGoals(state);
  if (!g.active) return null;
  const def = goalById(g.active.id);
  if (!def) { g.active = null; return null; }

  if (def.sustained) {
    const ok = def.immediate ? !!def.immediate(state) : true;
    g.track = ok ? Math.min(def.sustained, (g.track || 0) + days) : 0;
  }
  if (!goalReady(state, def)) return null;

  // Complete exactly once: the reward and the completed mark land together.
  if (g.completed.includes(def.id)) { g.active = null; return null; }
  const granted = grantReward(state, def);
  g.completed.push(def.id);
  g.active = null;
  g.track = 0;
  refreshOfferedGoals(state);
  log?.(`Goal complete: ${def.name}.`, 'goal');
  return { goal: def, granted, rewardText: def.rewardText };
}

export function goalTech(state) {
  return { ...ensureGoals(state).tech };
}

export function goalsSummary(state) {
  const g = ensureGoals(state);
  return {
    // Note: `progress` on the definition is the *function*; the computed numbers
    // are attached as `progressInfo` so the definition stays callable.
    offered: offeredGoals(state).map((def) => ({ ...def, progressInfo: goalProgress(state, def) })),
    active: g.active ? goalById(g.active.id) : null,
    activeProgress: g.active ? goalProgress(state, goalById(g.active.id)) : null,
    completed: g.completed.slice()
  };
}

export { GOALS, OFFERED_GOALS, goalById };
