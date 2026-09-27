import { clamp, sum } from './util.js';
import { rnd, chance, perDay, pick, range, weighted } from './rng.js';
import { PRODUCT_CATEGORIES, categoryById } from '../data/products.js';
import { COMPETITORS, PERSONALITIES, RIVAL_PRODUCT_NAMES, rivalById, ENTRANT_PREFIX, ENTRANT_SUFFIX, ENTRANT_BLURBS, ENTRANT_PERSONALITIES } from '../data/competitors.js';
import { stageOrder } from '../data/stages.js';
import { economyNow, trendFor } from './market.js';

// Rivals take a turn every so often. What they do depends on their personality
// and their situation, and a few of their moves are reactions to you: copying a
// hit launch, starting a price war in a market you lead, poaching when you are
// big enough to notice.

const catName = (id) => categoryById(id)?.name || id;

/** Builds the runtime record for a rival from its definition. */
export function makeRival(def, scenarioMods = {}) {
  return {
    id: def.id,
    name: def.name,
    blurb: def.blurb,
    personality: def.personality || 'steady',
    strength: clamp(def.strength * (1 + (scenarioMods.competitorStrength || 0)), 0.05, 1.2),
    cash: def.cash,
    valuation: def.valuation || def.strength * 5e8,
    headcount: def.headcount || 20,
    markets: def.markets.slice(),
    alive: true,
    acquired: false,
    acquiredBy: null,
    shares: Object.fromEntries(def.markets.map((mk) => [mk, def.strength * 0.25])),
    products: [],
    news: [],
    nextAction: 6 + Math.floor(def.strength * 10),
    rivalry: 0,
    wars: {}
  };
}

/** Repairs a saved rival record (older saves, or anything missing a field). */
export function normalizeRival(c) {
  const def = rivalById(c.id);
  if (!c.personality) c.personality = def?.personality || 'steady';
  if (!Number.isFinite(c.valuation)) c.valuation = def?.valuation || c.strength * 5e8;
  if (!Number.isFinite(c.headcount)) c.headcount = def?.headcount || 20;
  if (!Array.isArray(c.products)) c.products = [];
  if (!Array.isArray(c.news)) c.news = [];
  if (!Number.isFinite(c.nextAction)) c.nextAction = 5;
  if (!Number.isFinite(c.rivalry)) c.rivalry = 0;
  if (!c.wars || typeof c.wars !== 'object') c.wars = {};
  if (c.acquiredBy === undefined) c.acquiredBy = null;
  if (!c.shares || typeof c.shares !== 'object') c.shares = {};
  return c;
}

export const aliveRivals = (state) => state.competitors.filter((c) => c.alive && !c.acquired);

function news(state, c, text, log, kind = 'rival') {
  c.news.unshift({ day: Math.floor(state.time.day), text });
  if (c.news.length > 6) c.news.length = 6;
  log?.(text, kind);
}

/** Player's share of each category they sell into, for rival reactions. */
function playerCats(state) {
  return [...new Set(state.products.filter((p) => p.stage === 'live').map((p) => p.category))];
}

/** The rival that competes with you hardest, named once you are big enough to notice. */
export function nemesis(state) {
  const id = state.rivalState?.nemesis;
  return id ? state.competitors.find((c) => c.id === id && c.alive && !c.acquired) || null : null;
}

function pickNemesis(state) {
  const mine = new Set(playerCats(state));
  const scored = aliveRivals(state).map((c) => ({
    c, score: c.markets.filter((m) => mine.has(m)).length * 2 + c.strength + c.rivalry
  })).sort((a, b) => b.score - a.score);
  return scored[0]?.c || null;
}

export function ensureRivalState(state) {
  if (!state.rivalState || typeof state.rivalState !== 'object') state.rivalState = { nemesis: null, wars: [], passed: [] };
  if (!Array.isArray(state.rivalState.wars)) state.rivalState.wars = [];
  if (!Array.isArray(state.rivalState.passed)) state.rivalState.passed = [];
  return state.rivalState;
}

/** Extra churn from active price wars, per category. Read by tickProducts. */
export function priceWarChurn(state, cat) {
  const rs = state.rivalState;
  if (!rs) return 0;
  let v = 0;
  for (const w of rs.wars) if (w.cat === cat && w.until > state.time.day) v += w.churn;
  return Math.min(0.4, v);
}

export function tickCompetitors(state, mods, days, log) {
  const rs = ensureRivalState(state);
  const playerPower = clamp(Math.log10(1 + state.stats.revenueDay) / 5, 0, 1.2);
  const econ = economyNow(state);
  const econGrowth = econ.id === 'boom' ? 0.002 : econ.id === 'downturn' ? -0.002 : econ.id === 'recession' ? -0.004 : 0;
  const mine = new Set(playerCats(state));

  for (const c of state.competitors) {
    if (!c.alive || c.acquired) continue;
    normalizeRival(c);
    const growth = (0.010 + c.strength * 0.012 * (1 - c.strength / 1.2) - playerPower * 0.030) * days;
    c.strength = clamp(c.strength + growth * 0.35, 0.02, 1.2);
    for (const mk of c.markets) {
      const trend = trendFor(state, mk);
      const target = clamp(c.strength * 0.28 * (1 - playerPower * 0.75) * (1 + (trend?.marketSize || 0) * 0.3), 0.004, 0.35);
      c.shares[mk] = clamp((c.shares[mk] ?? 0.05) + (target - (c.shares[mk] ?? 0.05)) * clamp(0.05 * days, 0, 1), 0, 0.5);
    }
    c.cash += c.strength * 4000 * days;

    // Valuation: its own curve, pushed around by the economy and by you.
    const def = rivalById(c.id);
    const base = (def?.growth ?? c.growth ?? 0.006) * (0.6 + c.strength * 0.8);
    const pressure = c.markets.some((m) => mine.has(m)) ? playerPower * 0.0025 : 0;
    c.valuation = Math.max(2e5, c.valuation * (1 + (base + econGrowth - pressure) * days));
    c.headcount = Math.max(3, Math.round(c.valuation / 2.2e6 * 0.6 + 4));

    // Being in your markets while you grow builds a grudge.
    if (c.markets.some((m) => mine.has(m))) c.rivalry = clamp(c.rivalry + playerPower * 0.004 * days, 0, 1);

    // Incumbents shrink rather than vanish: someone always owns the old market.
    const durable = c.personality === 'incumbent' || c.personality === 'statesman';
    if (durable && c.strength < 0.15) c.strength = 0.15;
    if (!durable && c.strength < 0.06 && chance(state.rng, perDay(0.02, days))) {
      c.alive = false;
      news(state, c, `${c.name} shut down.`, log, 'good');
      continue;
    }
    if (state.time.day >= c.nextAction && state.time.day > 8) {
      rivalTurn(state, mods, c, log);
      const pers = PERSONALITIES[c.personality] || PERSONALITIES.steady;
      const pace = c.personality === 'blitz' ? 0.7 : c.personality === 'incumbent' ? 1.4 : 1;
      c.nextAction = state.time.day + range(state.rng, 7, 15) * pace;
    }
  }

  // Occasionally a rival expands into a new market.
  if (chance(state.rng, perDay(0.02, days))) {
    const alive = aliveRivals(state);
    if (alive.length) {
      const c = pick(state.rng, alive);
      const cats = PRODUCT_CATEGORIES.map((x) => x.id).filter((x) => !c.markets.includes(x));
      if (cats.length && c.strength > 0.3) {
        const mk = pick(state.rng, cats);
        c.markets.push(mk);
        c.shares[mk] = 0.04;
        news(state, c, `${c.name} entered the ${catName(mk)} market.`, log, 'info');
      }
    }
  }

  maybeSpawnEntrant(state, days, log);
  rs.wars = rs.wars.filter((w) => w.until > state.time.day);
  if (!rs.nemesis && stageOrder(state.company.stage) >= 2) {
    const n = pickNemesis(state);
    if (n) {
      rs.nemesis = n.id;
      n.rivalry = Math.max(n.rivalry, 0.4);
      news(state, n, `${n.name} has noticed you. They are your main rival now.`, log);
    }
  } else if (rs.nemesis && !nemesis(state)) {
    const gone = state.competitors.find((c) => c.id === rs.nemesis);
    rs.defeated = [...(rs.defeated || []), rs.nemesis];
    rs.nemesis = null;
    if (gone) log?.(`Your rivalry with ${gone.name} is over.`, 'stage');
  }
  checkPassed(state, log);
}

/** Records the first time you pass each rival's valuation. */
function checkPassed(state, log) {
  const rs = state.rivalState;
  const v = state.stats.valuation || 0;
  for (const c of state.competitors) {
    if (rs.passed.includes(c.id) || !c.alive || c.acquired) continue;
    if (v > c.valuation && state.time.day > 3) {
      rs.passed.push(c.id);
      log?.(`You are now worth more than ${c.name} (${moneyShort(c.valuation)}).`, 'stage');
    }
  }
}

const moneyShort = (n) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`);

function rivalTurn(state, mods, c, log) {
  const pers = PERSONALITIES[c.personality] || PERSONALITIES.steady;
  const mine = playerCats(state);
  const shared = c.markets.filter((m) => mine.includes(m));
  const w = { ...pers.weights };
  // Situational adjustments.
  if (c.cash < c.valuation * 0.004) w.raise = (w.raise || 0) + 3;
  if (!shared.length) { w.pricewar = 0; w.poach = (w.poach || 0) * 0.3; }
  if (stageOrder(state.company.stage) < 2) { w.poach = 0; w.lawsuit = 0; }
  const recentHit = state.lastLaunch && state.time.day - state.lastLaunch.day < 12 && ['hit', 'viral'].includes(state.lastLaunch.outcome);
  if (!recentHit) w.copy = 0;
  const rs = state.rivalState;
  const small = aliveRivals(state).filter((x) => x !== c && x.valuation < c.valuation * 0.08 && x.strength < 0.35);
  // Consolidation happens, but slowly: never in the first weeks, at most one
  // deal every couple of months across the whole market.
  if (!small.length || c.cash < 5e6 || state.time.day < 45 || state.time.day - (rs.lastDeal ?? -999) < 60) w.acquire = 0;
  if (state.time.day - (rs.lastPoach ?? -999) < 25) w.poach = 0;
  if (state.time.day - (rs.lastLawsuit ?? -999) < 45) w.lawsuit = 0;
  if (stageOrder(state.company.stage) < 3) w.lawsuit = 0;
  // Hype companies occasionally fail outright; blitzscalers run out of cash.
  const fragile = (c.personality === 'hype' || c.personality === 'blitz') && economyNow(state).id !== 'boom';
  w.stumble = fragile ? 0.6 : 0.25;

  const actions = Object.entries(w).filter(([, v]) => v > 0);
  const choice = weighted(state.rng, actions, ([, v]) => v);
  if (!choice) return;
  const [act] = choice;
  const day = state.time.day;

  if (act === 'launch' || act === 'copy') {
    let cat;
    if (act === 'copy') {
      const p = state.products.find((x) => x.id === state.lastLaunch.product);
      cat = p?.category || pick(state.rng, c.markets);
    } else cat = pick(state.rng, c.markets);
    const used = new Set(state.competitors.flatMap((x) => (x.products || []).map((p) => p.name)));
    const name = RIVAL_PRODUCT_NAMES.find((n) => !used.has(n) && rnd(state.rng) < 0.3) || `${c.name.split(' ')[0]} ${Math.floor(range(state.rng, 2, 9))}`;
    c.products.unshift({ name, cat, day: Math.floor(day) });
    if (c.products.length > 6) c.products.length = 6;
    if (!c.markets.includes(cat)) c.markets.push(cat);
    c.shares[cat] = clamp((c.shares[cat] || 0) + range(state.rng, 0.03, 0.07), 0, 0.5);
    c.strength = clamp(c.strength + 0.02, 0.02, 1.2);
    const aimed = mine.includes(cat);
    if (aimed) c.rivalry = clamp(c.rivalry + 0.1, 0, 1);
    news(state, c, act === 'copy'
      ? `${c.name} launched ${name}, a suspiciously familiar ${catName(cat)} product.`
      : `${c.name} launched ${name} (${catName(cat)}).`, log, aimed ? 'rival' : 'info');
    state.rivalState.lastMove = { day, rival: c.id, kind: act, cat, aimed };
  } else if (act === 'raise') {
    const size = c.valuation * range(state.rng, 0.08, 0.2);
    c.cash += size;
    c.valuation *= c.personality === 'hype' ? range(state.rng, 1.25, 1.6) : range(state.rng, 1.08, 1.25);
    c.strength = clamp(c.strength + 0.05, 0.02, 1.2);
    news(state, c, `${c.name} raised ${moneyShort(size)} at a ${moneyShort(c.valuation)} valuation.`, log, 'info');
  } else if (act === 'pricewar' && shared.length) {
    const cat = pick(state.rng, shared);
    const churn = 0.12 + c.strength * 0.12;
    state.rivalState.wars.push({ rival: c.id, cat, churn, until: day + 14 });
    c.cash *= 0.9;
    c.rivalry = clamp(c.rivalry + 0.08, 0, 1);
    news(state, c, `${c.name} slashed prices in ${catName(cat)}. Your customers there are shopping around.`, log, 'rival');
  } else if (act === 'poach') {
    const staff = state.employees.filter((e) => e.id !== 'founder');
    if (staff.length > 4) {
      state.rivalState.poachRequest = { day, rival: c.id };
      state.rivalState.lastPoach = day;
      news(state, c, `${c.name} recruiters are calling your team.`, log, 'rival');
    }
  } else if (act === 'acquire' && small.length) {
    const target = small.sort((a, b) => b.strength - a.strength)[0];
    target.acquired = true;
    target.alive = false;
    target.acquiredBy = c.id;
    c.strength = clamp(c.strength + target.strength * 0.5, 0.02, 1.2);
    c.valuation += target.valuation * 1.2;
    for (const mk of target.markets) {
      if (!c.markets.includes(mk)) c.markets.push(mk);
      c.shares[mk] = clamp((c.shares[mk] || 0) + (target.shares[mk] || 0) * 0.7, 0, 0.5);
    }
    state.rivalState.lastDeal = day;
    news(state, c, `${c.name} acquired ${target.name}.`, log, 'rival');
  } else if (act === 'lawsuit') {
    state.rivalState.lawsuit = { day, rival: c.id };
    state.rivalState.lastLawsuit = day;
    news(state, c, `${c.name}'s lawyers sent a letter about one of your patents. Or theirs.`, log, 'rival');
  } else if (act === 'stumble') {
    const bad = c.personality === 'hype' || c.personality === 'blitz';
    c.strength = clamp(c.strength - (bad ? 0.1 : 0.05), 0.02, 1.2);
    c.valuation *= bad ? range(state.rng, 0.55, 0.8) : range(state.rng, 0.85, 0.95);
    for (const mk of c.markets) c.shares[mk] = clamp((c.shares[mk] || 0) * 0.8, 0, 0.5);
    news(state, c, bad ? `${c.name} announced layoffs after missing its numbers.` : `${c.name} had a rough quarter.`, log, 'good');
    state.rivalState.lastStumble = { day, rival: c.id };
  }
}

/**
 * A new startup enters when the field thins out. Early entrants are small; late
 * ones are well-funded disruptors sized against you, so the top of the market
 * never becomes an empty room.
 */
function maybeSpawnEntrant(state, days, log) {
  const alive = aliveRivals(state).length;
  const rs = state.rivalState;
  if (state.time.day < 30 || alive >= 6) return;
  if (state.time.day - (rs.lastEntrant ?? -999) < 20) return;
  if (!chance(state.rng, perDay(0.04 * (6 - alive), days))) return;
  const used = new Set(state.competitors.map((c) => c.name));
  let name = null;
  for (let i = 0; i < 12 && !name; i++) {
    const n = `${pick(state.rng, ENTRANT_PREFIX)}${pick(state.rng, ENTRANT_SUFFIX)}`;
    if (!used.has(n)) name = n;
  }
  if (!name) return;
  const mine = playerCats(state);
  const cats = PRODUCT_CATEGORIES.map((x) => x.id);
  const home = mine.length && chance(state.rng, 0.75) ? pick(state.rng, mine) : pick(state.rng, cats);
  const scale = Math.max(8e6, (state.stats.valuation || 0) * range(state.rng, 0.03, 0.15));
  const def = {
    id: `entrant_${(rs.entrants = (rs.entrants || 0) + 1)}`,
    name, blurb: pick(state.rng, ENTRANT_BLURBS), personality: pick(state.rng, ENTRANT_PERSONALITIES),
    strength: range(state.rng, 0.25, 0.45), cash: scale * 0.15, valuation: scale, headcount: 10, markets: [home]
  };
  const c = makeRival(def);
  c.entrant = true;
  c.growth = range(state.rng, 0.006, 0.011);
  c.nextAction = state.time.day + range(state.rng, 4, 9);
  state.competitors.push(c);
  rs.lastEntrant = state.time.day;
  news(state, c, `New entrant: ${name} launched in ${catName(home)}. ${def.blurb}`, log, mine.includes(home) ? 'rival' : 'info');
}

export function acquisitionPrice(c) {
  return Math.max(250000, c.valuation * 0.55 + c.cash * 0.3);
}

export function acquisitionTargets(state) {
  return aliveRivals(state).map((c) => ({ ...c, price: acquisitionPrice(c) }));
}

export function acquire(state, mods, id) {
  const c = state.competitors.find((x) => x.id === id && x.alive && !x.acquired);
  if (!c) return { ok: false, reason: 'Not available.' };
  const price = acquisitionPrice(c);
  if (state.company.cash < price) return { ok: false, reason: 'Not enough cash.' };
  state.company.cash -= price;
  c.acquired = true;
  c.alive = false;
  c.acquiredBy = 'player';
  state.company.reputation += 0.25 + c.strength * 0.4;
  for (const p of state.products) {
    if (c.markets.includes(p.category)) p.marketBonus += 0.12 + c.strength * 0.15;
  }
  return { ok: true, price, name: c.name };
}

export const marketShares = (state, categoryId) =>
  state.competitors.filter((c) => c.alive && !c.acquired && c.markets.includes(categoryId))
    .map((c) => ({ name: c.name, share: c.shares[categoryId] || 0 }));

/** You and every rival still standing, ranked by valuation. */
export function leaderboard(state) {
  const rows = aliveRivals(state).map((c) => ({ id: c.id, name: c.name, valuation: c.valuation, you: false }));
  rows.push({ id: 'you', name: state.company.name, valuation: state.stats.valuation || 0, you: true });
  return rows.sort((a, b) => b.valuation - a.valuation);
}
