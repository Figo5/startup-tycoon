import { FUNDING_ROUNDS, EXITS, roundById, INVESTORS, investorById, REVENUE_LOAN } from '../data/funding.js';
import { addBoost } from './modifiers.js';
import { stageOrder } from '../data/stages.js';
import { mul } from './modifiers.js';
import { clamp } from './util.js';
import { diluteFounder, readEquity, runEnded } from './equity.js';
import { trendFundingMul } from './market.js';

export function investorValuation(state, mods, round) {
  const annual = state.stats.revenueDay * 365;
  const v = Math.max(round.floor, annual * round.multiple);
  return v * mul(mods, 'fundingValuation', -0.8) * (state.funding.bonus || 1) * trendFundingMul(state);
}

export function fundingOffers(state, mods) {
  const ended = runEnded(state);
  const bootstrapped = Array.isArray(state.challenges) && state.challenges.includes('bootstrap');
  return FUNDING_ROUNDS.map((round) => {
    const taken = state.funding.rounds.filter((r) => r.id === round.id).length;
    const blocked = taken > 0 && !round.repeatable;
    const req = round.req || {};
    const okRev = state.stats.revenueDay >= (req.revenueDay || 0);
    const okStage = !req.stage || stageOrder(state.company.stage) >= stageOrder(req.stage);
    const val = investorValuation(state, mods, round);
    const terms = INVESTORS
      .filter((inv) => !inv.minRound || FUNDING_ROUNDS.findIndex((r) => r.id === round.id) >= FUNDING_ROUNDS.findIndex((r) => r.id === inv.minRound))
      .map((inv) => {
        const v = val * inv.valMul;
        const equity = round.equity * inv.size;
        return { investor: inv.id, name: inv.name, blurb: inv.blurb, valuation: v, equity, cash: v * equity,
          rep: round.rep * inv.repMul, target: inv.target || null, perk: inv.perk || null, exitMod: inv.exitMod || null };
      });
    return {
      id: round.id,
      name: round.name,
      blurb: round.blurb,
      equity: round.equity,
      valuation: val,
      cash: val * round.equity,
      rep: round.rep,
      terms,
      available: !ended && !blocked && okRev && okStage && !bootstrapped,
      reason: ended ? 'This run has already ended.' : bootstrapped ? 'Bootstrapped challenge: no equity rounds' : blocked ? 'Already raised' : !okStage ? `Needs the ${req.stage} stage`
        : !okRev ? `Needs $${Math.round(req.revenueDay).toLocaleString()}/day revenue` : null
    };
  });
}

export function raise(state, mods, roundId, investorId = 'lead') {
  if (runEnded(state)) return { ok: false, reason: 'This run has already ended.' };
  const offer = fundingOffers(state, mods).find((o) => o.id === roundId);
  if (!offer || !offer.available) return { ok: false, reason: offer?.reason || 'Not available.' };
  const term = offer.terms.find((t) => t.investor === investorId);
  if (!term) return { ok: false, reason: 'That investor is not offering on this round.' };
  // Ownership moves through the one transaction path, so a round cannot be
  // applied twice or push the founder below zero.
  const sale = diluteFounder(state, term.equity, `round:${roundId}`);
  if (!sale.ok) return { ok: false, reason: sale.reason };
  ensureFunding(state);
  state.company.cash += term.cash;
  state.company.totalRaised += term.cash;
  state.company.reputation += term.rep;
  state.funding.rounds.push({ id: roundId, investor: investorId, cash: term.cash, equity: term.equity, day: state.time.day, valuation: term.valuation });
  state.funding.bonus = 1;
  if (term.target) {
    const base = Math.max(state.stats.revenueDay, 50);
    state.funding.targets.push({ round: roundId, goal: Math.round(base * term.target.revenueMul), from: base,
      start: state.time.day, deadline: state.time.day + term.target.days, status: 'open' });
  }
  if (term.perk) state.funding.perks.push({ round: roundId, mods: { ...term.perk } });
  if (term.exitMod) for (const [k, v] of Object.entries(term.exitMod)) state.funding.exitMods[k] = (state.funding.exitMods[k] || 0) + v;
  return { ok: true, offer: { ...offer, ...term }, equity: sale.after };
}

export function ensureFunding(state) {
  const f = state.funding || (state.funding = { rounds: [], offers: [], exitOffers: [] });
  if (!Array.isArray(f.rounds)) f.rounds = [];
  if (!Array.isArray(f.targets)) f.targets = [];
  if (!Array.isArray(f.perks)) f.perks = [];
  if (!f.exitMods || typeof f.exitMods !== 'object') f.exitMods = {};
  if (!Array.isArray(f.loans)) f.loans = [];
  return f;
}

/** Permanent modifiers from strategic investors. Merged by computeMods. */
export function fundingPerks(state) {
  const out = {};
  for (const p of state.funding?.perks || []) for (const [k, v] of Object.entries(p.mods || {})) out[k] = (out[k] || 0) + v;
  return out;
}

/** Board growth targets resolve on their own: hit them early or miss the deadline. */
export function tickFunding(state, days, log) {
  const f = ensureFunding(state);
  for (const t of f.targets) {
    if (t.status !== 'open') continue;
    if (state.stats.revenueDay >= t.goal) {
      t.status = 'hit';
      state.company.reputation += 0.2;
      addBoost(state, 'board_momentum', { valuation: 0.08, fundingValuation: 0.1 }, 60, 'Board momentum');
      log?.(`Board target hit: revenue passed $${Math.round(t.goal).toLocaleString()}/day. Your investors are thrilled.`, 'stage');
    } else if (state.time.day >= t.deadline) {
      t.status = 'missed';
      state.company.reputation = Math.max(0.2, state.company.reputation - 0.25);
      state.company.marketingBudget = Math.round(state.company.marketingBudget * 0.6);
      addBoost(state, 'board_pressure', { valuation: -0.12, moraleGain: -0.05, fundingValuation: -0.15 }, 60, 'Board pressure');
      log?.('Board target missed. The board forced cost cuts and the next round will be harder.', 'bad');
    }
  }
  // Revenue-based loans are repaid out of revenue in tickEconomy.
  if (f.loans.some((l) => l.owed <= 0.5)) {
    if (!state.flags) state.flags = { unlocked: [] };
    state.flags.loanRepaid = true;
    log?.('The revenue loan is paid off.', 'good');
  }
  f.loans = f.loans.filter((l) => l.owed > 0.5);
}

export function loanOffer(state) {
  const f = ensureFunding(state);
  const L = REVENUE_LOAN;
  const principal = Math.round(Math.max(L.floor, state.stats.revenueDay * L.days));
  const reason = runEnded(state) ? 'This run has already ended.'
    : stageOrder(state.company.stage) < stageOrder(L.minStage) ? 'Needs the Tiny Startup stage'
    : state.stats.revenueDay < L.minRevenue ? `Needs $${L.minRevenue}/day revenue`
    : f.loans.length ? 'Repay the current loan first' : null;
  return { principal, repay: Math.round(principal * L.repayMul), share: L.share, available: !reason, reason };
}

export function takeLoan(state) {
  const o = loanOffer(state);
  if (!o.available) return { ok: false, reason: o.reason };
  const f = ensureFunding(state);
  f.loans.push({ principal: o.principal, owed: o.repay, share: o.share, day: state.time.day });
  state.company.cash += o.principal;
  return { ok: true, principal: o.principal, repay: o.repay };
}

/** Daily repayment for loans; returns the amount paid this step. */
export function loanRepayment(state, revenueDay, days) {
  let paid = 0;
  for (const l of state.funding?.loans || []) {
    const pay = Math.min(l.owed, Math.max(0, revenueDay) * l.share * days);
    l.owed -= pay;
    paid += pay;
  }
  return paid;
}

export { diluteFounder as dilute };

export function canExit(state) {
  if (runEnded(state)) return false;
  return stageOrder(state.company.stage) >= stageOrder('late')
    || state.flags.unlocked.includes('exit_offer');
}

/** The rival a merger would be with: the most valuable one worth at least 40% of you. */
export function mergerPartner(state) {
  const v = state.stats.valuation || 0;
  return state.competitors.filter((c) => c.alive && !c.acquired && c.valuation >= v * 0.4)
    .sort((a, b) => b.valuation - a.valuation)[0] || null;
}

function earlyExit(state, e) {
  const order = stageOrder(state.company.stage);
  const v = state.stats.valuation || 0;
  if (e.id === 'acquihire') {
    return { gate: order >= stageOrder('growing'), gateReason: 'Buyers only look at teams once you are Growing',
      value: Math.max(v * 0.45, (state.employees.length - 1) * 1.2e6) };
  }
  if (e.id === 'pe') {
    const profit = Math.max(0, state.stats.netDay || 0) * 365;
    return { gate: order >= stageOrder('scaleup') && profit > 0,
      gateReason: order < stageOrder('scaleup') ? 'Private equity looks at Scale-Ups and up' : 'Needs a profitable company',
      value: profit * 14 + Math.max(0, state.company.cash) * 0.8 };
  }
  if (e.id === 'merger') {
    const partner = mergerPartner(state);
    return { gate: order >= stageOrder('major') && !!partner,
      gateReason: order < stageOrder('major') ? 'Needs the Major Tech stage' : 'No rival is big enough to merge with',
      value: v * 1.1, partner };
  }
  return { gate: false, value: 0 };
}

export function exitOptions(state, mods) {
  const v = state.stats.valuation;
  const gate = canExit(state);
  const ended = runEnded(state);
  const bootstrap = Array.isArray(state.challenges) && state.challenges.includes('bootstrap');
  return EXITS.map((e) => {
    const req = e.req || {};
    const okRev = state.stats.revenueDay >= (req.revenueDay || 0);
    const okRep = state.company.reputation >= (req.reputation || 0);
    const equity = readEquity(state);
    const exitMod = 1 + (state.funding?.exitMods?.[e.id] || 0);
    const early = e.early ? earlyExit(state, e) : null;
    const base = early ? early.value : v * e.multiple;
    const open = early ? early.gate : gate;
    return {
      ...e,
      value: base * exitMod,
      proceeds: base * exitMod * equity,
      partner: early?.partner?.name || null,
      available: open && okRev && okRep && !ended,
      reason: ended ? 'This run has already ended.'
        : !open ? (early ? early.gateReason : 'No buyer yet - reach the Late Stage or field an acquisition offer')
        : !okRev ? `Needs $${Math.round(req.revenueDay).toLocaleString()}/day revenue`
        : !okRep ? `Needs ${req.reputation} reputation` : null
    };
  });
}
