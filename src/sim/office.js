import { OFFICE_TIERS, ROOMS, tierById, tierIndex, roomById, roomSlots } from '../data/office.js';
import { stageOrder } from '../data/stages.js';
import { flat } from './modifiers.js';
import { metaEffects } from './state.js';

export function officeOptions(state) {
  const cur = tierIndex(state.office.tier);
  const capped = Array.isArray(state.challenges) && state.challenges.includes('lean_office');
  return OFFICE_TIERS.map((t, i) => ({
    ...t,
    owned: i <= cur,
    current: i === cur,
    available: i === cur + 1 && stageOrder(state.company.stage) >= stageOrder(t.unlock) && state.company.cash >= t.cost && !(capped && i > tierIndex('loft')),
    reason: i <= cur ? null
      : capped && i > tierIndex('loft') ? 'Small Office challenge'
      : i > cur + 1 ? 'Upgrade one tier at a time'
      : stageOrder(state.company.stage) < stageOrder(t.unlock) ? `Needs the ${t.unlock} stage`
      : state.company.cash < t.cost ? 'Not enough cash' : null
  }));
}

export function upgradeOffice(state) {
  const cur = tierIndex(state.office.tier);
  const next = OFFICE_TIERS[cur + 1];
  if (!next) return { ok: false, reason: 'This is the largest office available.' };
  const opt = officeOptions(state)[cur + 1];
  if (!opt.available) return { ok: false, reason: opt.reason || 'Not available.' };
  state.company.cash -= next.cost;
  state.office.tier = next.id;
  state.office.deskCapacity = next.desks;
  for (const e of state.employees) e.desk = null;   // renderer reseats everyone
  return { ok: true, tier: next };
}

export function roomOptions(state) {
  const cur = tierIndex(state.office.tier);
  const full = state.office.rooms.length >= roomCapacity(state);
  return ROOMS.map((r) => {
    const owned = state.office.rooms.includes(r.id);
    const tierOk = cur >= tierIndex(r.minTier);
    return {
      ...r, owned,
      available: !owned && tierOk && !full && state.company.cash >= r.cost,
      reason: owned ? null : !tierOk ? `Needs the ${tierById(r.minTier).name}`
        : full ? `No room left (${roomCapacity(state)} slots)` : state.company.cash < r.cost ? 'Not enough cash' : null
    };
  });
}

/** Room slots in the current office, plus any from founder upgrades. */
export function roomCapacity(state) {
  return roomSlots(state.office.tier) + (metaEffects(state.meta).roomSlots || 0);
}

/** Daily upkeep of every room built. Paid with the rent. */
export function roomUpkeep(state) {
  return state.office.rooms.reduce((a, id) => a + (roomById(id)?.upkeep || 0), 0);
}

/** Knock a room down to free its slot. Nothing is refunded. */
export function removeRoom(state, id) {
  if (!state.office.rooms.includes(id)) return { ok: false, reason: 'Not built.' };
  state.office.rooms = state.office.rooms.filter((r) => r !== id);
  return { ok: true };
}

export function buyRoom(state, id) {
  const opt = roomOptions(state).find((r) => r.id === id);
  if (!opt) return { ok: false, reason: 'Unknown room.' };
  if (opt.owned) return { ok: false, reason: 'Already built.' };
  if (!opt.available) return { ok: false, reason: opt.reason || 'Not available.' };
  state.company.cash -= opt.cost;
  state.office.rooms.push(id);
  if (opt.effect?.capacity) state.infra.capacity += 0;  // room capacity is applied as a modifier
  return { ok: true, room: opt };
}

export const deskCapacity = (state, mods) => state.office.deskCapacity + flat(mods, 'deskBonus');
