// Acquisitions: buying smaller companies outright, once each.
//
// The one rule that matters: the whole purchase - cash, people, revenue, tech -
// is applied in a single synchronous transaction guarded by `completed`. A
// replayed call, a double click, a reload or an import finds the target already
// owned and pays nothing.
//
// Distinct from sim/competitors.js `acquire`, which buys out a *rival* to
// relieve market pressure. This is the "buy the company" decision: it brings
// staff, revenue and capability, plus everything wrong with them.

import { ACQUISITION_POOL, OFFERS_BY_STAGE, targetById } from '../data/acquisitions.js';
import { emptyAcquisitions, makeEmployee } from './state.js';
import { spendCash, runEnded } from './equity.js';
import { stageOrder } from '../data/stages.js';
import { addBoost } from './modifiers.js';
import { pick } from './rng.js';
import { clamp, sum } from './util.js';

export { OFFERS_BY_STAGE };

export function ensureAcquisitions(state) {
  if (!state.acquisitions || typeof state.acquisitions !== 'object') state.acquisitions = emptyAcquisitions();
  const a = state.acquisitions;
  if (!Array.isArray(a.targets)) a.targets = [];
  if (!Array.isArray(a.completed)) a.completed = [];
  if (!Array.isArray(a.assets)) a.assets = [];
  if (!a.tech || typeof a.tech !== 'object') a.tech = {};
  if (!Number.isFinite(a.integrationUntil)) a.integrationUntil = 0;
  return a;
}

export function offersAllowed(state) {
  return OFFERS_BY_STAGE[state.company.stage] ?? 0;
}

/** Which pool entries this company has already bought or been offered. */
export function usedTargetIds(state) {
  const a = ensureAcquisitions(state);
  const taken = new Set(a.completed.map((c) => c.id));
  for (const t of a.targets) taken.add(t.id);
  return taken;
}

export function targetPrice(state, def) {
  const valuation = Math.max(0, state.stats?.valuation || 0);
  return Math.max(def.floor, Math.round(valuation * def.priceShare));
}

/**
 * Fills the standing offers up to the stage allowance. Deterministic in the
 * run's RNG, and additive: a save keeps exactly the offers it had.
 */
export function refreshAcquisitionTargets(state) {
  const a = ensureAcquisitions(state);
  const allowed = offersAllowed(state);
  if (allowed <= 0) return a.targets;
  const used = usedTargetIds(state);
  let guard = 0;
  while (a.targets.length < allowed && guard++ < 20) {
    const pool = ACQUISITION_POOL.filter((t) => !used.has(t.id));
    if (!pool.length) break;
    const def = pick(state.rng, pool);
    used.add(def.id);
    a.targets.push({
      id: def.id,
      price: targetPrice(state, def),
      day: state.time.day,
      expires: false
    });
  }
  return a.targets;
}

export function acquisitionOffers(state) {
  const a = ensureAcquisitions(state);
  return a.targets.map((offer) => {
    const def = targetById(offer.id);
    const owned = a.completed.some((c) => c.id === offer.id);
    const price = targetPrice(state, def || {});
    const affordable = state.company.cash >= price;
    return {
      ...(def || {}),
      ...offer,
      price,
      owned,
      techNote: def?.techNote || '',
      revenueDay: Math.round(Math.max(0, state.stats?.revenueDay || 0) * (def?.revenueShare || 0)),
      available: !owned && affordable && !runEnded(state),
      reason: owned ? 'Already acquired'
        : runEnded(state) ? 'This run has already ended.'
        : !affordable ? 'Not enough cash' : null
    };
  });
}

/**
 * Buys one target. Everything below happens exactly once, in one call, with the
 * affordability check and the ownership mark in the same synchronous block.
 */
export function acquireCompany(state, mods, id) {
  const a = ensureAcquisitions(state);
  if (runEnded(state)) return { ok: false, reason: 'This run has already ended.' };
  if (a.completed.some((c) => c.id === id)) return { ok: false, reason: 'Already acquired.' };
  const def = targetById(id);
  if (!def) return { ok: false, reason: 'Unknown target.' };
  if (!a.targets.some((t) => t.id === id)) return { ok: false, reason: 'That company is no longer for sale.' };
  const price = targetPrice(state, def);
  const pay = spendCash(state, price, `acquisition:${id}`);
  if (!pay.ok) return { ok: false, reason: pay.reason };

  // --- people (exactly once) ---
  const hires = [];
  for (const [role, n] of def.employees || []) {
    for (let i = 0; i < n; i++) {
      const e = makeEmployee(state.rng, role, { hiredDay: state.time.day, salaryMul: 1.05 });
      e.morale = clamp(0.7 - def.moraleHit, 0.15, 1.1);
      state.employees.push(e);
      hires.push(e);
    }
  }

  // --- revenue, load and integration ---
  const revenueDay = Math.round(Math.max(0, state.stats?.revenueDay || 0) * (def.revenueShare || 0));
  a.assets.push({
    id: def.id,
    name: def.name,
    day: state.time.day,
    price,
    revenueDay,
    infraLoad: def.infraLoad || 0,
    supportLoad: def.supportLoad || 0,
    employees: hires.length
  });

  // --- technology, permanent, merged by computeMods ---
  for (const [k, v] of Object.entries(def.tech || {})) a.tech[k] = (a.tech[k] || 0) + v;

  // --- integration pain ---
  const days = Math.max(1, def.integrationDays || 10);
  a.integrationUntil = Math.max(a.integrationUntil, state.time.day + days);
  addBoost(state, 'integration', { devSpeed: -0.12, churn: 0.03 }, days, `${def.name} integration`);
  for (const e of state.employees) e.morale = clamp(e.morale - def.moraleHit, 0, 1.1);
  for (const p of state.products) p.techDebt = clamp((p.techDebt || 0) + (def.debt || 0) * 0.5, 0, 3);

  // --- users, folded into the closest product the company actually runs ---
  const target = state.products.find((p) => p.stage === 'live' && p.category === def.category)
    || state.products.filter((p) => p.stage === 'live').sort((x, y) => y.users - x.users)[0]
    || null;
  if (target) target.users += def.users || 0;

  a.completed.push({ id: def.id, day: state.time.day, price, name: def.name });
  a.targets = a.targets.filter((t) => t.id !== id);

  return {
    ok: true, target: def, price, hires: hires.length, revenueDay, days,
    users: target ? def.users || 0 : 0, product: target?.name || null
  };
}

export function acquiredRevenue(state) {
  return sum(ensureAcquisitions(state).assets, (x) => x.revenueDay || 0);
}

export function acquiredInfraLoad(state) {
  return sum(ensureAcquisitions(state).assets, (x) => x.infraLoad || 0);
}

export function acquiredSupportLoad(state) {
  return sum(ensureAcquisitions(state).assets, (x) => x.supportLoad || 0);
}

export function acquisitionTech(state) {
  return { ...ensureAcquisitions(state).tech };
}

export function integrationActive(state) {
  const a = ensureAcquisitions(state);
  return a.integrationUntil > (state.time?.day || 0);
}

export { ACQUISITION_POOL, targetById };
