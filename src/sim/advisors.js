// Advisors: a slot-limited pool of retained experts.
//
// They work for this company. Prestige resets them (see data/advisors.js), which
// is a stated design decision, not an oversight.
//
// Ownership of money: the engagement fee is charged once per hire through
// equity.spendCash; the retainer is a daily share of revenue, returned by
// advisorRetainerDay and charged by the economy tick. Firing is free and gives
// nothing back, so a hire/fire loop is never profitable.

import { ADVISORS, ADVISOR_SLOTS, advisorById } from '../data/advisors.js';
import { emptyAdvisors } from './state.js';
import { spendCash, runEnded } from './equity.js';
import { stageOrder } from '../data/stages.js';
import { clamp, sum } from './util.js';

export function ensureAdvisors(state) {
  if (!state.advisors || typeof state.advisors !== 'object') state.advisors = emptyAdvisors();
  if (!Array.isArray(state.advisors.hired)) state.advisors.hired = [];
  return state.advisors;
}

export function advisorSlots(state) {
  return ADVISOR_SLOTS[state.company.stage] ?? 0;
}

export function advisorsUnlocked(state) {
  return advisorSlots(state) > 0;
}

export function hiredAdvisorIds(state) {
  return ensureAdvisors(state).hired.map((h) => h.id);
}

export function isHired(state, id) {
  return hiredAdvisorIds(state).includes(id);
}

/** Daily cash retained by the advisory bench. Charged by the economy tick. */
export function advisorRetainerDay(state) {
  const rev = Math.max(0, state.stats?.revenueDay || 0);
  return sum(ensureAdvisors(state).hired, (h) => {
    const def = advisorById(h.id);
    if (!def) return 0;
    return Math.max(10, Math.round(rev * def.retainerRev));
  });
}

/** Merged into computeMods, so advisor effects go through the normal path. */
export function advisorMods(state) {
  const out = {};
  for (const h of ensureAdvisors(state).hired) {
    const def = advisorById(h.id);
    if (!def) continue;
    for (const [k, v] of Object.entries(def.effects)) out[k] = (out[k] || 0) + v;
  }
  return out;
}

export function advisorOffers(state) {
  const order = stageOrder(state.company.stage);
  const slots = advisorSlots(state);
  const hiredCount = ensureAdvisors(state).hired.length;
  return ADVISORS.map((def) => {
    const hired = isHired(state, def.id);
    const stageOk = order >= stageOrder(def.unlock);
    const slotFree = hiredCount < slots;
    const affordable = state.company.cash >= def.fee;
    return {
      ...def,
      hired,
      available: !hired && stageOk && slotFree && affordable,
      retainerDay: Math.max(10, Math.round(Math.max(0, state.stats?.revenueDay || 0) * def.retainerRev)),
      reason: hired ? 'On staff'
        : !stageOk ? `Available at the ${def.unlock} stage`
        : !slotFree ? `All ${slots} advisor slots are full`
        : !affordable ? 'Cannot afford the engagement fee' : null
    };
  });
}

export function hireAdvisor(state, id) {
  if (runEnded(state)) return { ok: false, reason: 'This run has already ended.' };
  const offer = advisorOffers(state).find((a) => a.id === id);
  if (!offer) return { ok: false, reason: 'Unknown advisor.' };
  if (offer.hired) return { ok: false, reason: `${offer.name} is already on staff.` };
  if (!offer.available) return { ok: false, reason: offer.reason || 'Not available.' };
  const slots = advisorSlots(state);
  const adm = ensureAdvisors(state);
  // Re-check the slot from authoritative state, immediately before the purchase.
  if (adm.hired.length >= slots) return { ok: false, reason: `All ${slots} advisor slots are full` };
  const pay = spendCash(state, offer.fee, `advisor:${id}`);
  if (!pay.ok) return { ok: false, reason: pay.reason };
  adm.hired.push({ id, day: state.time.day, fee: pay.spent });
  return { ok: true, advisor: offer, fee: pay.spent };
}

export function dismissAdvisor(state, id) {
  const adm = ensureAdvisors(state);
  const i = adm.hired.findIndex((h) => h.id === id);
  if (i < 0) return { ok: false, reason: 'Not on staff.' };
  const [h] = adm.hired.splice(i, 1);
  return { ok: true, advisor: advisorById(h.id), refund: 0 };
}

export function clampAdvisorCount(state) {
  const adm = ensureAdvisors(state);
  const slots = advisorSlots(state);
  if (adm.hired.length <= slots) return 0;
  const removed = adm.hired.length - slots;
  adm.hired = adm.hired.slice(0, slots);
  return removed;
}

export { ADVISORS, ADVISOR_SLOTS, advisorById };
