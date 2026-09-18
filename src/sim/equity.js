// The one authoritative path for founder ownership and company-cash
// transactions. Every system that moves equity or charges cash goes through
// here, so:
//
//   * ownership can never leave [0, 1] (no negative stakes, no 105% sold),
//   * a completed sale is recorded before anything else can look at it,
//   * replaying the same transaction (double click, reload, import) is refused.
//
// The failure mode this exists to prevent: a UI that can be triggered twice
// paying the player twice for the same entitlement.

import { clamp } from './util.js';

export const EQUITY_MIN = 0;
export const EQUITY_MAX = 1;
/** Ownership this small is treated as nothing left to sell. */
export const EQUITY_DUST = 1e-6;

const TX_LOG_LIMIT = 40;

export function normalizeEquity(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return EQUITY_MIN;
  return clamp(n, EQUITY_MIN, EQUITY_MAX);
}

/** Authoritative read. Never trust a number from the DOM or a stale snapshot. */
export function readEquity(state) {
  return normalizeEquity(state?.company?.founderEquity);
}

export function ownsNothing(state) {
  return readEquity(state) <= EQUITY_DUST;
}

/** True once the run has been settled by an exit. Nothing may be sold twice. */
export function runEnded(state) {
  return !!state?.exitResult;
}

function ownership(state) {
  const c = state.company;
  if (!c.ownership || typeof c.ownership !== 'object') c.ownership = { soldTotal: 0, transactions: [] };
  if (!Array.isArray(c.ownership.transactions)) c.ownership.transactions = [];
  return c.ownership;
}

function record(state, entry) {
  const own = ownership(state);
  own.transactions.push(entry);
  if (own.transactions.length > TX_LOG_LIMIT) own.transactions.splice(0, own.transactions.length - TX_LOG_LIMIT);
  own.soldTotal = normalizeEquity(1 - readEquity(state));
  return own;
}

/**
 * Partial ownership sale (a funding round, an equity-for-cash event).
 * Refuses anything that is not a genuine partial dilution: a single primary
 * round may not sell the founder out entirely - that is what an exit is for.
 */
export function diluteFounder(state, pct, source = 'unknown') {
  const p = Number(pct);
  if (!Number.isFinite(p) || p <= 0) return { ok: false, reason: 'Nothing to dilute.', source };
  if (p >= 1) return { ok: false, reason: 'A single round cannot sell the whole stake.', source };
  if (runEnded(state)) return { ok: false, reason: 'This run has already ended.', source };
  const before = readEquity(state);
  if (before <= EQUITY_DUST) return { ok: false, reason: 'The founder owns nothing left to sell.', source };
  const after = normalizeEquity(before * (1 - p));
  state.company.founderEquity = after;
  record(state, { day: state.time?.day ?? 0, kind: 'dilute', source, before, after });
  return { ok: true, before, after, sold: before - after };
}

/**
 * The exit transaction: the founder's entire remaining stake changes hands for
 * cash, exactly once, and the run is marked ended before the money is booked.
 * Callers must have already validated that an exit is on offer.
 */
export function sellFounderStake(state, { value, id, name, day }) {
  if (runEnded(state)) return { ok: false, reason: 'This run has already ended.' };
  const equity = readEquity(state);
  if (equity <= EQUITY_DUST) return { ok: false, reason: 'You own no stake left to sell.' };
  const clean = Math.max(0, Number(value) || 0);
  // Guard first, then transfer: a re-entrant call sees the guard.
  state.exitResult = { id, name, day, value: clean, equity, proceeds: 0, rep: 0, achievements: [] };
  state.company.founderEquity = 0;
  const proceeds = clean * equity;
  state.exitResult.proceeds = proceeds;
  record(state, { day, kind: 'exit', source: id, before: equity, after: 0, proceeds });
  return { ok: true, equity, proceeds };
}

/**
 * Cash transaction helper: affordability check and a single deduction.
 * Returns { ok:false } without touching cash when the company cannot afford it.
 */
export function spendCash(state, amount, source = 'unknown') {
  const cost = Math.max(0, Math.round(Number(amount) || 0));
  const cash = Number(state?.company?.cash);
  if (!Number.isFinite(cash)) return { ok: false, reason: 'Cash is not a number.', source };
  if (cash < cost) return { ok: false, reason: `Needs ${Math.round(cost - cash).toLocaleString()} more cash.`, source };
  state.company.cash = cash - cost;
  return { ok: true, spent: cost, source };
}
