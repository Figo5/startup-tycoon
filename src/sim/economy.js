import { clamp, sum, uid } from './util.js';
import { tierById } from '../data/office.js';
import { mul, flat } from './modifiers.js';
import { liveProducts, totalCustomers } from './products.js';
import { fire } from './workforce.js';

export const MISC_COST_PER_EMPLOYEE_DAY = 6;

export function contractRevenue(state) {
  return sum(state.contracts, (c) => c.revenueDay);
}

export function tickContracts(state, mods, days, log) {
  for (const c of state.contracts) {
    c.remaining -= days;
    if (c.sla) {
      const down = liveProducts(state).some((p) => p.outage > 0);
      if (down) c.slaBreaches += days;
    }
  }
  const expired = state.contracts.filter((c) => c.remaining <= 0);
  for (const c of expired) log?.(`Contract with ${c.name} ended.`, 'info');
  state.contracts = state.contracts.filter((c) => c.remaining > 0);
}

export function slaPenalty(state, days) {
  let pen = 0;
  for (const c of state.contracts) {
    if (c.sla && liveProducts(state).some((p) => p.outage > 0)) pen += c.revenueDay * 1.5 * days;
  }
  return pen;
}

export function valuation(state, mods) {
  const annual = state.stats.revenueDay * 365;
  const growth = clamp(state.stats.growthRate ?? 0, -0.5, 1.5);
  const qualityFactor = 1 + (state.products.length ? Math.max(...state.products.map((p) => p.quality)) : 0) * 0.35;
  const multiple = 7 * mods.stageValuationMul * qualityFactor * (1 + growth * 0.8) * mul(mods, 'valuation');
  const userValue = sum(liveProducts(state), (p) => p.users) * 1.2;
  return Math.max(0, annual * multiple + userValue + Math.max(0, state.company.cash) * 0.35);
}

export function tickEconomy(state, mods, wf, revenue, infraCost, days, log) {
  const st = state.stats;
  const tier = tierById(state.office.tier);
  const rent = tier ? tier.rent : 0;
  const marketing = Math.max(0, state.company.marketingBudget);
  const misc = state.employees.length * MISC_COST_PER_EMPLOYEE_DAY;
  const contracts = contractRevenue(state);
  const penalties = slaPenalty(state, 1);

  const revDay = revenue + contracts - penalties;
  const expDay = wf.payrollDay + infraCost + marketing + rent + misc;

  st.revenueDay = revDay;
  st.payrollDay = wf.payrollDay;
  st.infraDay = infraCost;
  st.marketingDay = marketing;
  st.rentDay = rent;
  st.miscDay = misc;
  st.expenseDay = expDay;
  st.netDay = revDay - expDay;
  st.users = sum(liveProducts(state), (p) => p.users);
  st.customers = sum(liveProducts(state), (p) => totalCustomers(p));

  state.company.cash += st.netDay * days;
  state.company.lifetimeRevenue += Math.max(0, revDay) * days;
  state.company.lifetimeExpenses += expDay * days;

  if (state.company.cash < 0) emergencyMeasures(state, log);
  st.valuation = valuation(state, mods);
  st.runwayDays = st.netDay >= 0 ? Infinity : state.company.cash / -st.netDay;
  return st;
}

/** Cash never goes hard-negative: the company cuts instead of dying. */
function emergencyMeasures(state, log) {
  if (state.company.marketingBudget > 0) {
    state.company.marketingBudget = 0;
    log?.('Out of cash: marketing spend cut to zero.', 'bad');
  }
  const cuttable = state.employees.filter((e) => e.id !== 'founder');
  if (state.company.cash < 0 && cuttable.length) {
    const worst = cuttable.sort((a, b) => (a.skill * a.productivity) - (b.skill * b.productivity))[0];
    fire(state, worst.id);
    log?.(`Out of cash: ${worst.name} was laid off.`, 'bad');
  }
  if (state.company.cash < 0) state.company.cash = 0;
}

export function addContract(state, mods, { name, sizeMul = 1, sla = false, years = 2 }) {
  const base = Math.max(180, state.stats.revenueDay * 0.22 + 220);
  const revenueDay = base * sizeMul * mul(mods, 'contractSize');
  const c = {
    id: uid('ctr'),
    name: name || 'Enterprise Customer',
    revenueDay,
    sla,
    supportLoad: revenueDay / 260,
    infraLoad: revenueDay / 900,
    remaining: years * 365,
    slaBreaches: 0
  };
  state.contracts.push(c);
  return c;
}
