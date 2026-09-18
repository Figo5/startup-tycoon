import { FUNDING_ROUNDS, EXITS, roundById } from '../data/funding.js';
import { stageOrder } from '../data/stages.js';
import { mul } from './modifiers.js';
import { clamp } from './util.js';
import { diluteFounder, readEquity, runEnded } from './equity.js';

export function investorValuation(state, mods, round) {
  const annual = state.stats.revenueDay * 365;
  const v = Math.max(round.floor, annual * round.multiple);
  return v * mul(mods, 'fundingValuation', -0.8) * (state.funding.bonus || 1);
}

export function fundingOffers(state, mods) {
  const ended = runEnded(state);
  return FUNDING_ROUNDS.map((round) => {
    const taken = state.funding.rounds.filter((r) => r.id === round.id).length;
    const blocked = taken > 0 && !round.repeatable;
    const req = round.req || {};
    const okRev = state.stats.revenueDay >= (req.revenueDay || 0);
    const okStage = !req.stage || stageOrder(state.company.stage) >= stageOrder(req.stage);
    const val = investorValuation(state, mods, round);
    return {
      id: round.id,
      name: round.name,
      blurb: round.blurb,
      equity: round.equity,
      valuation: val,
      cash: val * round.equity,
      rep: round.rep,
      available: !ended && !blocked && okRev && okStage,
      reason: ended ? 'This run has already ended.' : blocked ? 'Already raised' : !okStage ? `Needs the ${req.stage} stage`
        : !okRev ? `Needs $${Math.round(req.revenueDay).toLocaleString()}/day revenue` : null
    };
  });
}

export function raise(state, mods, roundId) {
  if (runEnded(state)) return { ok: false, reason: 'This run has already ended.' };
  const offer = fundingOffers(state, mods).find((o) => o.id === roundId);
  if (!offer || !offer.available) return { ok: false, reason: offer?.reason || 'Not available.' };
  // Ownership moves through the one transaction path, so a round cannot be
  // applied twice or push the founder below zero.
  const sale = diluteFounder(state, offer.equity, `round:${roundId}`);
  if (!sale.ok) return { ok: false, reason: sale.reason };
  state.company.cash += offer.cash;
  state.company.totalRaised += offer.cash;
  state.company.reputation += offer.rep;
  state.funding.rounds.push({ id: roundId, cash: offer.cash, equity: offer.equity, day: state.time.day, valuation: offer.valuation });
  state.funding.bonus = 1;
  return { ok: true, offer, equity: sale.after };
}

export { diluteFounder as dilute };

export function canExit(state) {
  if (runEnded(state)) return false;
  return stageOrder(state.company.stage) >= stageOrder('late')
    || state.flags.unlocked.includes('exit_offer');
}

export function exitOptions(state, mods) {
  const v = state.stats.valuation;
  const gate = canExit(state);
  const ended = runEnded(state);
  return EXITS.map((e) => {
    const req = e.req || {};
    const okRev = state.stats.revenueDay >= (req.revenueDay || 0);
    const okRep = state.company.reputation >= (req.reputation || 0);
    const equity = readEquity(state);
    return {
      ...e,
      value: v * e.multiple,
      proceeds: v * e.multiple * equity,
      available: gate && okRev && okRep && !ended,
      reason: ended ? 'This run has already ended.' : !gate ? 'No buyer yet - reach the Late Stage or field an acquisition offer'
        : !okRev ? `Needs $${Math.round(req.revenueDay).toLocaleString()}/day revenue`
        : !okRep ? `Needs ${req.reputation} reputation` : null
    };
  });
}
