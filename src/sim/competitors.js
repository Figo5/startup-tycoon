import { clamp } from './util.js';
import { rnd, chance, perDay, pick, range } from './rng.js';
import { PRODUCT_CATEGORIES } from '../data/products.js';
import { mul } from './modifiers.js';

/** Rivals are simulated coarsely: a strength score and per-market share. */
export function tickCompetitors(state, mods, days, log) {
  const playerPower = clamp(Math.log10(1 + state.stats.revenueDay) / 5, 0, 1.2);
  for (const c of state.competitors) {
    if (!c.alive || c.acquired) continue;
    const growth = (0.010 + c.strength * 0.012 * (1 - c.strength / 1.2) - playerPower * 0.030) * days;
    c.strength = clamp(c.strength + growth * 0.35, 0.02, 1.2);
    for (const mk of c.markets) {
      const target = clamp(c.strength * 0.28 * (1 - playerPower * 0.75), 0.004, 0.35);
      c.shares[mk] = clamp((c.shares[mk] ?? 0.05) + (target - (c.shares[mk] ?? 0.05)) * clamp(0.05 * days, 0, 1), 0, 0.5);
    }
    c.cash += c.strength * 4000 * days;
    if (c.strength < 0.06 && chance(state.rng, perDay(0.02, days))) {
      c.alive = false;
      log?.(`${c.name} shut down.`, 'good');
    }
  }
  // Occasionally a rival expands into a new market.
  if (chance(state.rng, perDay(0.02, days))) {
    const alive = state.competitors.filter((c) => c.alive && !c.acquired);
    if (alive.length) {
      const c = pick(state.rng, alive);
      const cats = PRODUCT_CATEGORIES.map((x) => x.id).filter((x) => !c.markets.includes(x));
      if (cats.length && c.strength > 0.3) {
        const mk = pick(state.rng, cats);
        c.markets.push(mk);
        c.shares[mk] = 0.04;
        log?.(`${c.name} entered the ${PRODUCT_CATEGORIES.find((x) => x.id === mk).name} market.`, 'info');
      }
    }
  }
}

export function acquisitionTargets(state) {
  return state.competitors.filter((c) => c.alive && !c.acquired).map((c) => ({
    ...c,
    price: Math.max(250000, c.strength * 9e6 + c.cash * 0.8)
  }));
}

export function acquire(state, mods, id) {
  const c = state.competitors.find((x) => x.id === id && x.alive && !x.acquired);
  if (!c) return { ok: false, reason: 'Not available.' };
  const price = Math.max(250000, c.strength * 9e6 + c.cash * 0.8);
  if (state.company.cash < price) return { ok: false, reason: 'Not enough cash.' };
  state.company.cash -= price;
  c.acquired = true;
  c.alive = false;
  state.company.reputation += 0.25 + c.strength * 0.4;
  for (const p of state.products) {
    if (c.markets.includes(p.category)) p.marketBonus += 0.12 + c.strength * 0.15;
  }
  return { ok: true, price, name: c.name };
}

export const marketShares = (state, categoryId) =>
  state.competitors.filter((c) => c.alive && !c.acquired && c.markets.includes(categoryId))
    .map((c) => ({ name: c.name, share: c.shares[categoryId] || 0 }));
