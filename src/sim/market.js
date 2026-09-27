import { ECONOMY, TRENDS, trendDefById } from '../data/market.js';
import { PRODUCT_CATEGORIES } from '../data/products.js';
import { stageOrder } from '../data/stages.js';
import { range, weighted, pick, rnd } from './rng.js';

/** The economy stays calm while a solo founder learns the game. */
export const MARKET_START_DAY = 18;

export function emptyMarket() {
  return { economy: 'normal', until: MARKET_START_DAY + 30, trends: [], nextTrend: MARKET_START_DAY + 8, history: [] };
}

export function ensureMarket(state) {
  const m = state.market && typeof state.market === 'object' ? state.market : emptyMarket();
  if (!ECONOMY[m.economy]) m.economy = 'normal';
  if (!Number.isFinite(m.until)) m.until = (state.time?.day || 0) + 30;
  if (!Array.isArray(m.trends)) m.trends = [];
  m.trends = m.trends.filter((t) => t && trendDefById(t.id) && typeof t.cat === 'string');
  if (!Number.isFinite(m.nextTrend)) m.nextTrend = (state.time?.day || 0) + 10;
  if (!Array.isArray(m.history)) m.history = [];
  state.market = m;
  return m;
}

export const economyNow = (state) => ECONOMY[state.market?.economy] || ECONOMY.normal;

/** Modifier bag merged by computeMods. */
export function marketMods(state) {
  return economyNow(state).mods;
}

/** The active trend in a category, joined with its definition. */
export function trendFor(state, cat) {
  const t = (state.market?.trends || []).find((x) => x.cat === cat && x.until > state.time.day);
  if (!t) return null;
  return { ...trendDefById(t.id), ...t };
}

export const trendMarketMul = (state, cat) => 1 + (trendFor(state, cat)?.marketSize || 0);

/** Investor warmth from trends in the categories the company actually sells in. */
export function trendFundingMul(state) {
  const cats = [...new Set(state.products.filter((p) => p.stage === 'live').map((p) => p.category))];
  if (!cats.length) return 1;
  const best = Math.max(...cats.map((c) => trendFor(state, c)?.funding || 0));
  const worst = Math.min(...cats.map((c) => trendFor(state, c)?.funding || 0));
  return 1 + (best > 0 ? best : 0) + (worst < 0 && best <= 0 ? worst : 0);
}

function nextEconomy(state, cur) {
  const opts = Object.entries(ECONOMY[cur].next).filter(([id]) => id !== 'recession' || stageOrder(state.company.stage) >= 2);
  const choice = weighted(state.rng, opts, ([, w]) => w);
  return choice ? choice[0] : 'normal';
}

export function tickMarket(state, days, log) {
  const m = ensureMarket(state);
  const day = state.time.day;
  if (day < MARKET_START_DAY) return;

  if (day >= m.until) {
    const prev = m.economy;
    const id = nextEconomy(state, prev);
    const def = ECONOMY[id];
    m.economy = id;
    m.until = day + range(state.rng, def.days[0], def.days[1]);
    if (id !== prev) {
      m.history.unshift({ day: Math.floor(day), kind: 'economy', id });
      log?.(`Economy: ${def.name}. ${def.blurb}`, id === 'boom' ? 'good' : id === 'normal' ? 'info' : 'bad');
    }
  }

  m.trends = m.trends.filter((t) => t.until > day);
  const cap = stageOrder(state.company.stage) >= 3 ? 2 : 1;
  if (day >= m.nextTrend && m.trends.length < cap) {
    const known = new Set(PRODUCT_CATEGORIES.map((c) => c.id));
    const mine = new Set(state.products.map((p) => p.category));
    const options = [];
    for (const t of TRENDS) {
      for (const cat of t.cats) {
        if (!known.has(cat) || m.trends.some((x) => x.cat === cat)) continue;
        // Waves in markets you are in (or could enter) are the interesting ones.
        options.push({ t, cat, w: (mine.has(cat) ? 2.2 : 1) * (t.negative ? 0.7 : 1) });
      }
    }
    const chosen = weighted(state.rng, options, (o) => o.w);
    if (chosen) {
      const until = day + range(state.rng, chosen.t.days[0], chosen.t.days[1]);
      m.trends.push({ id: chosen.t.id, cat: chosen.cat, start: day, until });
      m.history.unshift({ day: Math.floor(day), kind: 'trend', id: chosen.t.id, cat: chosen.cat });
      const catName = PRODUCT_CATEGORIES.find((c) => c.id === chosen.cat)?.name || chosen.cat;
      log?.(`Market trend: ${chosen.t.name} (${catName}). ${chosen.t.blurb}`, chosen.t.negative ? 'bad' : 'market');
    }
    m.nextTrend = day + range(state.rng, 16, 30);
  }
  if (m.history.length > 20) m.history.length = 20;
}
