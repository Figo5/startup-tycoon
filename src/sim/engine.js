import { computeMods, pruneBoosts } from './modifiers.js';
import { computeWorkforce, tickWorkforce } from './workforce.js';
import { distributeEngineering, autoQueueProjects, tickProducts, liveProducts, totalCustomers } from './products.js';
import { tickInfra } from './infra.js';
import { tickEconomy, tickContracts } from './economy.js';
import { tickResearch } from './research.js';
import { tickCompetitors } from './competitors.js';
import { tickEvents } from './events.js';
import { tickRoadmaps, autoStartRoadmaps } from './roadmap.js';
import { tickGoals } from './goals.js';
import { refreshAcquisitionTargets } from './acquisitions.js';
import { checkStageUp } from './stages.js';
import { clamp, sum } from './util.js';
import { MAX_OFFLINE_DAYS, REAL_SECONDS_PER_DAY } from './state.js';

export const OFFLINE_CHUNK_DAYS = 0.05;
export const LIVE_STEP_SECONDS = 0.25;

/** One simulation step of `days` game-days. Everything economic happens here. */
export function step(state, days, log) {
  if (!(days > 0)) return state;
  // A settled run is over: no further production, no further payouts, no matter
  // who calls step() - the live loop, the offline catch-up or a test harness.
  if (state.exitResult) return state;
  const mods = computeMods(state);
  state.modCache = mods;
  pruneBoosts(state);

  const wf = computeWorkforce(state, mods);
  state.workforceCache = wf;

  const completed = distributeEngineering(state, mods, wf, days);
  for (const c of completed) {
    log?.(`${c.product.name}: ${c.project.name} complete.`, c.project.typeId === 'mvp' ? 'stage' : 'good');
  }
  autoQueueProjects(state, mods, log);

  // Roadmaps run alongside the project queue, driven by product/design/eng output.
  // A managed engineering department keeps them moving without the player.
  if (state.departments.engineering?.managerId) {
    autoStartRoadmaps(state, mods, log, !!mods.flags.has('autoProjects'));
  }
  tickRoadmaps(state, mods, wf, days, log);

  const { revenue } = tickProducts(state, mods, wf, days, log);
  const infraCost = tickInfra(state, mods, wf, days, log);
  tickContracts(state, mods, days, log);
  tickEconomy(state, mods, wf, revenue, infraCost, days, log);
  tickWorkforce(state, mods, days, log);
  tickResearch(state, mods, days, log);
  tickCompetitors(state, mods, days, log);
  tickEvents(state, mods, days, log);
  refreshAcquisitionTargets(state);
  tickGoals(state, mods, days, log);
  checkStageUp(state, log);

  state.time.day += days;
  updateGrowth(state, revenue, days);
  recordHistory(state);
  return state;
}

function updateGrowth(state, revenue, days) {
  const st = state.stats;
  const prev = st._prevRevenue ?? revenue;
  const rel = days > 0 ? (revenue - prev) / Math.max(prev, 1) / days : 0;
  st.growthRate = clamp((st.growthRate ?? 0) * 0.92 + rel * 30 * 0.08, -1, 3);
  st._prevRevenue = revenue;
}

function recordHistory(state) {
  const h = state.stats.history;
  const last = h[h.length - 1];
  if (last && state.time.day - last.day < 1) return;
  h.push({
    day: Math.round(state.time.day * 10) / 10,
    revenue: state.stats.revenueDay,
    expense: state.stats.expenseDay,
    cash: state.company.cash,
    users: state.stats.users,
    employees: state.employees.length,
    valuation: state.stats.valuation
  });
  if (h.length > 500) h.splice(0, h.length - 500);
}

/** Advance by real seconds (live play). */
export function advanceReal(state, realSeconds, log) {
  const days = realSeconds / REAL_SECONDS_PER_DAY;
  step(state, days, log);
}

function snapshot(state) {
  return {
    cash: state.company.cash,
    revenue: state.company.lifetimeRevenue,
    expenses: state.company.lifetimeExpenses,
    users: sum(liveProducts(state), (p) => p.users),
    customers: sum(liveProducts(state), (p) => totalCustomers(p)),
    employees: state.employees.length,
    stage: state.company.stage,
    valuation: state.stats.valuation,
    completed: state.products.flatMap((p) => p.completed.map((c) => `${p.name}:${c}`))
  };
}

/**
 * Simulate elapsed wall-clock time. Returns a summary, or null if nothing to do.
 * Clock moving backwards yields zero progress, never a reward.
 */
export function runOffline(state, nowMs = Date.now()) {
  const lastMs = state.time.lastRealMs || nowMs;
  const rawSeconds = (nowMs - lastMs) / 1000;
  state.time.lastRealMs = nowMs;
  if (!(rawSeconds > 5)) return null;
  // An ended run has nothing left to credit, and must never re-open a payout.
  if (state.exitResult) return null;

  const rawDays = rawSeconds / REAL_SECONDS_PER_DAY;
  const days = Math.min(rawDays, MAX_OFFLINE_DAYS);
  const capped = rawDays > MAX_OFFLINE_DAYS;

  const before = snapshot(state);
  const entries = [];
  const log = (text, kind) => { if (kind !== 'info') entries.push({ text, kind }); };

  let remaining = days;
  let guard = 0;
  while (remaining > 1e-6 && guard++ < 20000) {
    const chunk = Math.min(OFFLINE_CHUNK_DAYS, remaining);
    step(state, chunk, log);
    remaining -= chunk;
  }
  const after = snapshot(state);

  return {
    realSeconds: Math.min(rawSeconds, MAX_OFFLINE_DAYS * REAL_SECONDS_PER_DAY),
    gameDays: days,
    capped,
    cash: after.cash - before.cash,
    revenue: after.revenue - before.revenue,
    expenses: after.expenses - before.expenses,
    users: after.users - before.users,
    customers: after.customers - before.customers,
    employees: after.employees - before.employees,
    stageChanged: after.stage !== before.stage ? after.stage : null,
    projects: after.completed.filter((c) => !before.completed.includes(c)),
    entries: dedupe(entries).slice(0, 12)
  };
}

function dedupe(entries) {
  const seen = new Map();
  for (const e of entries) {
    const k = e.text.replace(/[\d.,]+/g, '#');
    seen.set(k, (seen.get(k) || { ...e, count: 0 }));
    seen.get(k).count++;
  }
  return [...seen.values()].map((e) => (e.count > 1 ? { ...e, text: `${e.text} (x${e.count})` } : e));
}
