import { FUNDING_ROUNDS, EXITS, roundById } from '../data/funding.js';
import { stageOrder } from '../data/stages.js';
import { mul } from './modifiers.js';
import { clamp } from './util.js';

export function investorValuation(state, mods, round) {
  const annual = state.stats.revenueDay * 365;
  const v = Math.max(round.floor, annual * round.multiple);
  return v * mul(mods, 'fundingValuation', -0.8) * (state.funding.bonus || 1);
}

export function fundingOffers(state, mods) {
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
      available: !blocked && okRev && okStage,
      reason: blocked ? 'Already raised' : !okStage ? `Needs the ${req.stage} stage`
        : !okRev ? `Needs $${Math.round(req.revenueDay).toLocaleString()}/day revenue` : null
    };
  });
}

export function raise(state, mods, roundId) {
  const offer = fundingOffers(state, mods).find((o) => o.id === roundId);
  if (!offer || !offer.available) return { ok: false, reason: offer?.reason || 'Not available.' };
  state.company.cash += offer.cash;
  state.company.totalRaised += offer.cash;
  state.company.founderEquity *= (1 - offer.equity);
  state.company.reputation += offer.rep;
  state.funding.rounds.push({ id: roundId, cash: offer.cash, equity: offer.equity, day: state.time.day, valuation: offer.valuation });
  state.funding.bonus = 1;
  return { ok: true, offer };
}

export function dilute(state, pct) {
  state.company.founderEquity *= (1 - pct);
}

export function canExit(state) {
  return stageOrder(state.company.stage) >= stageOrder('late')
    || state.flags.unlocked.includes('exit_offer');
}

export function exitOptions(state, mods) {
  const v = state.stats.valuation;
  const gate = canExit(state);
  return EXITS.map((e) => {
    const req = e.req || {};
    const okRev = state.stats.revenueDay >= (req.revenueDay || 0);
    const okRep = state.company.reputation >= (req.reputation || 0);
    return {
      ...e,
      value: v * e.multiple,
      proceeds: v * e.multiple * state.company.founderEquity,
      available: gate && okRev && okRep,
      reason: !gate ? 'No buyer yet - reach the Late Stage or field an acquisition offer'
        : !okRev ? `Needs $${Math.round(req.revenueDay).toLocaleString()}/day revenue`
        : !okRep ? `Needs ${req.reputation} reputation` : null
    };
  });
}
