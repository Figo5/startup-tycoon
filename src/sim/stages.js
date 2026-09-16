import { STAGES, stageById, stageOrder } from '../data/stages.js';
import { liveProducts } from './products.js';

export function stageSnapshot(state) {
  return {
    employees: state.employees.length,
    revenueDay: state.stats.revenueDay,
    productsLive: liveProducts(state).length,
    valuation: state.stats.valuation
  };
}

export function meetsStage(state, stage) {
  const snap = stageSnapshot(state);
  return Object.entries(stage.req || {}).every(([k, v]) => (snap[k] ?? 0) >= v);
}

export function nextStage(state) {
  const cur = stageOrder(state.company.stage);
  return STAGES.find((s) => s.order === cur + 1) || null;
}

export function stageProgress(state) {
  const next = nextStage(state);
  if (!next) return null;
  const snap = stageSnapshot(state);
  const parts = Object.entries(next.req).map(([k, v]) => ({
    key: k, have: snap[k] ?? 0, need: v, pct: Math.min(1, (snap[k] ?? 0) / v)
  }));
  return { stage: next, parts, pct: parts.reduce((a, b) => a + b.pct, 0) / parts.length };
}

export function checkStageUp(state, log) {
  const next = nextStage(state);
  if (!next || !meetsStage(state, next)) return null;
  state.company.stage = next.id;
  log?.(`New company stage: ${next.name}. ${next.blurb}`, 'stage');
  return next;
}
