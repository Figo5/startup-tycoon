import { OFFICE_TIERS, ROOMS, tierById, tierIndex, roomById } from '../data/office.js';
import { stageOrder } from '../data/stages.js';
import { flat } from './modifiers.js';

export function officeOptions(state) {
  const cur = tierIndex(state.office.tier);
  return OFFICE_TIERS.map((t, i) => ({
    ...t,
    owned: i <= cur,
    current: i === cur,
    available: i === cur + 1 && stageOrder(state.company.stage) >= stageOrder(t.unlock) && state.company.cash >= t.cost,
    reason: i <= cur ? null
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
  return ROOMS.map((r) => {
    const owned = state.office.rooms.includes(r.id);
    const tierOk = cur >= tierIndex(r.minTier);
    return {
      ...r, owned,
      available: !owned && tierOk && state.company.cash >= r.cost,
      reason: owned ? null : !tierOk ? `Needs the ${tierById(r.minTier).name}`
        : state.company.cash < r.cost ? 'Not enough cash' : null
    };
  });
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
