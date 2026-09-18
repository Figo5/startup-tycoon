import { PRESTIGE_UPGRADES, prestigeById, prestigeCost, SCENARIOS } from '../data/prestige.js';
import { EXITS } from '../data/funding.js';
import { exitOptions, canExit } from './funding.js';
import { newGame, emptyMeta, metaEffects, normalizeMeta } from './state.js';
import { stageOrder } from '../data/stages.js';
import { clamp } from './util.js';
import { readEquity, runEnded, sellFounderStake } from './equity.js';

export const REP_DIVISOR = 1.5e8;
export const REP_EXPONENT = 0.5;

export { canExit, runEnded };

export function repFor(state, mods, proceeds, exitDef) {
  const scenario = SCENARIOS.find((s) => s.id === state.scenarioId) || SCENARIOS[0];
  const fx = metaEffects(state.meta);
  const base = Math.pow(Math.max(0, proceeds) / REP_DIVISOR, REP_EXPONENT);
  return Math.floor(base * (exitDef?.repMul ?? 1) * scenario.repMul * (1 + (fx.exitRep || 0)));
}

/**
 * Available exits. Once the run has been settled every option is closed, so the
 * UI cannot re-offer a stake that has already been sold.
 */
export function exitPreview(state, mods) {
  const ended = runEnded(state);
  return exitOptions(state, mods).map((o) => ({
    ...o,
    rep: repFor(state, mods, o.proceeds, o),
    ...(ended ? { available: false, reason: 'This run has already ended.' } : {})
  }));
}

/**
 * Settles the run exactly once. Order matters: the guard and the ownership
 * transfer happen before the permanent reward is booked, so a second call (a
 * double click, a replayed handler, a reload) finds the run already ended.
 */
export function performExit(state, mods, exitId) {
  if (runEnded(state)) return { ok: false, reason: 'This run has already ended.' };
  const opt = exitPreview(state, mods).find((o) => o.id === exitId);
  if (!opt) return { ok: false, reason: 'Unknown exit.' };
  if (!opt.available) return { ok: false, reason: opt.reason || 'Not available yet.' };
  if (!canExit(state)) return { ok: false, reason: 'No buyer at this stage.' };

  // Anything that reads the pre-sale company has to run before the stake moves.
  const equityBefore = readEquity(state);
  const achievements = achievementsFor(state, opt);

  const sale = sellFounderStake(state, { value: opt.value, id: opt.id, name: opt.name, day: state.time.day });
  if (!sale.ok) return { ok: false, reason: sale.reason };

  const rep = repFor(state, mods, sale.proceeds, opt);
  const meta = normalizeMeta(state.meta || emptyMeta());
  meta.founderRep += rep;
  meta.lifetimeRep += rep;
  meta.runs.unshift({
    company: state.company.name,
    exit: opt.name,
    value: opt.value,
    proceeds: sale.proceeds,
    equity: equityBefore,
    rep,
    days: Math.round(state.time.day),
    stage: state.company.stage,
    scenario: state.scenarioId,
    at: Date.now()
  });
  meta.runs = meta.runs.slice(0, 25);
  for (const s of SCENARIOS) {
    if (meta.runs.length >= s.unlockRuns && !meta.unlockedScenarios.includes(s.id)) meta.unlockedScenarios.push(s.id);
  }
  for (const a of achievements) if (!meta.achievements.includes(a)) meta.achievements.push(a);

  state.exitResult.rep = rep;
  state.exitResult.achievements = achievements.slice();
  state.time.paused = true;

  return {
    ok: true,
    meta,
    summary: {
      ...opt, proceeds: sale.proceeds, equity: equityBefore, value: opt.value,
      days: Math.round(state.time.day), rep, achievements
    }
  };
}

function achievementsFor(state, opt) {
  const out = [];
  if (state.company.founderEquity > 0.99) out.push('bootstrapped');
  if (opt.id === 'ipo') out.push('went_public');
  if (state.time.day < 200) out.push('fast_exit');
  if (state.employees.length >= 100) out.push('big_company');
  if (state.products.filter((p) => p.stage === 'live').length >= 5) out.push('portfolio');
  if (state.competitors.some((c) => c.acquired)) out.push('acquirer');
  return out;
}

export function prestigeLevels(meta) {
  const m = normalizeMeta(meta);
  return PRESTIGE_UPGRADES.map((up) => {
    const level = clamp(Math.floor(Number(m.upgrades[up.id]) || 0), 0, up.max);
    const maxed = level >= up.max;
    return {
      ...up,
      level,
      maxed,
      remaining: Math.max(0, up.max - level),
      affordable: !maxed && m.founderRep >= prestigeCost(up, level),
      price: maxed ? null : prestigeCost(up, level)
    };
  });
}

/**
 * Buys exactly one level of exactly one upgrade, from authoritative meta state.
 *
 * `txId` is optional but the UI always passes one: a purchase carrying a tx id
 * that this meta has already applied is refused, which is what makes a double
 * click, a replayed handler, a reload or an imported save unable to buy the
 * same level twice.
 */
export function buyPrestige(meta, id, opts = {}) {
  const up = prestigeById(id);
  if (!up) return { ok: false, reason: 'Unknown upgrade.' };
  const m = normalizeMeta(meta);
  const txId = typeof opts.txId === 'string' && opts.txId ? opts.txId : null;
  if (txId && m.appliedTx.includes(txId)) {
    return { ok: false, duplicate: true, reason: 'That purchase was already applied.' };
  }
  const level = clamp(Math.floor(Number(m.upgrades[id]) || 0), 0, up.max);
  if (level >= up.max) return { ok: false, reason: 'Already at maximum level.', level, max: up.max };
  const price = prestigeCost(up, level);
  if (!Number.isFinite(m.founderRep) || m.founderRep < price) {
    return { ok: false, reason: `Needs ${price} Founder Reputation.`, price };
  }
  // Single deduction, single increment.
  m.founderRep -= price;
  m.upgrades[id] = level + 1;
  if (txId) {
    m.appliedTx.push(txId);
    if (m.appliedTx.length > 50) m.appliedTx.splice(0, m.appliedTx.length - 50);
  }
  return { ok: true, level: level + 1, max: up.max, price, remaining: m.founderRep, txId };
}

export function availableScenarios(meta) {
  const m = normalizeMeta(meta);
  return SCENARIOS.filter((s) => m.runs.length >= s.unlockRuns);
}

export function startNextRun(meta, { seed, scenarioId, companyName } = {}) {
  return newGame({ seed, meta: normalizeMeta(meta), scenarioId, companyName });
}

export { PRESTIGE_UPGRADES };
