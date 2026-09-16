import { clamp, sum } from './util.js';
import { chance, perDay, range } from './rng.js';
import { categoryById } from '../data/products.js';
import { mul, flat, has } from './modifiers.js';
import { prioritySplit } from './workforce.js';
import { liveProducts, totalCustomers } from './products.js';

export const UNIT_COST_DAY = 3.2;      // $ per capacity unit per day
export const TARGET_UTILIZATION = 0.7;  // what autoscaling aims for
export const EMERGENCY_UTILIZATION = 1.25; // beyond this, ops steps in without you

export function effectiveCapacity(state, mods) {
  return state.infra.capacity * mul(mods, 'capacityPerUnit') + flat(mods, 'capacity');
}

export function computeLoad(state) {
  let load = 0;
  for (const p of liveProducts(state)) {
    const cat = categoryById(p.category);
    load += (p.users / 1000) * cat.infraLoad * (1 - p.infraEff);
  }
  for (const c of state.contracts) load += c.infraLoad || 0;
  return load;
}

export function tickInfra(state, mods, wf, days, log) {
  const infra = state.infra;
  const split = prioritySplit(state, 'infra');   // 0 = cost, 1 = reliability
  const infraOut = wf.out.infra || 0;

  infra.load = computeLoad(state);

  if (has(mods, 'autoscale')) {
    const want = Math.ceil(infra.load / TARGET_UTILIZATION / mul(mods, 'capacityPerUnit'));
    infra.capacity = Math.max(8, want);
  } else if (infra.load > effectiveCapacity(state, mods) * EMERGENCY_UTILIZATION) {
    // Ops will not let an unattended company burn down: capacity creeps up toward
    // barely-enough. Sizing it yourself (or researching autoscaling) is still better,
    // because this reacts slowly and never reaches a comfortable headroom.
    const want = infra.load / 0.95 / mul(mods, 'capacityPerUnit');
    const step = Math.max(1, infra.capacity * 0.25 * days);
    if (want > infra.capacity) {
      infra.capacity = Math.min(want, infra.capacity + step);
      if (!infra.emergencyNoted) { log?.('Ops scaled capacity up to keep the service alive.', 'bad'); infra.emergencyNoted = true; }
    }
  } else {
    infra.emergencyNoted = false;
  }

  const cap = Math.max(1, effectiveCapacity(state, mods));
  const util = infra.load / cap;
  infra.utilization = util;

  const costEff = clamp(1 - (1 - split) * infraOut * 0.010, 0.45, 1);
  const costDay = infra.capacity * UNIT_COST_DAY * mul(mods, 'infraCost', -0.85) * costEff;
  infra.spendDay = costDay;

  const relBonus = split * infraOut * 0.004 + flat(mods, 'reliability');
  const overload = Math.max(0, util - 0.85);
  const target = clamp(0.985 - overload * 1.1 + relBonus, 0.25, 0.999);
  infra.reliability = clamp(infra.reliability + (target - infra.reliability) * clamp(0.3 * days, 0, 1), 0.1, 0.999);

  // Outage rolls
  const live = liveProducts(state);
  if (live.length && infra.outageTimer <= 0) {
    const risk = 0.035 * (1 - infra.reliability) * 12 * (1 + overload * 3) * mul(mods, 'outageRisk', -0.9);
    if (chance(state.rng, perDay(clamp(risk, 0, 0.5), days))) {
      const victim = live.sort((a, b) => b.users - a.users)[0];
      startOutage(state, mods, victim, log);
    }
  }
  infra.outageTimer = Math.max(0, infra.outageTimer - days);

  return costDay;
}

export function startOutage(state, mods, product, log) {
  const dur = range(state.rng, 0.15, 0.6) * mul(mods, 'outageDuration', -0.85);
  product.outage = Math.max(product.outage, dur);
  state.infra.outageTimer = 4;
  log?.(`${product.name} is down. Reliability ${(state.infra.reliability * 100).toFixed(1)}%.`, 'bad');
  return dur;
}

export function setCapacity(state, units) {
  state.infra.capacity = Math.max(4, Math.round(units));
  return state.infra.capacity;
}
