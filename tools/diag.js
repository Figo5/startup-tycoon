import { newGame, emptyMeta, REAL_SECONDS_PER_DAY } from '../src/sim/state.js';
import { step } from '../src/sim/engine.js';
import { computeMods } from '../src/sim/modifiers.js';
import { marketCap, totalCustomers } from '../src/sim/products.js';
import { money, abbrev } from '../src/sim/util.js';

// Re-use the balance operator by importing it through a tiny shim.
const mod = await import('./balance_lib.js');
const { run } = mod;
const hours = Number(process.argv[2] || 24);
const { state } = run(11, 'idle', 30 * hours, {});
const mods = computeMods(state);
console.log('day', Math.round(state.time.day), 'stage', state.company.stage, 'rep', state.company.reputation.toFixed(2),
  'cash', money(state.company.cash), 'rev', money(state.stats.revenueDay), 'exp', money(state.stats.expenseDay));
console.log('staff', state.employees.length, 'desks', state.office.deskCapacity, 'office', state.office.tier,
  'research', state.research.completed.length, 'equity', state.company.founderEquity.toFixed(2));
for (const p of state.products) {
  console.log(` ${p.name.padEnd(10)} ${p.category.padEnd(11)} users ${abbrev(p.users).padStart(7)} / cap ${abbrev(marketCap(state, mods, p)).padStart(7)}`
    + ` cust ${abbrev(totalCustomers(p)).padStart(6)} rev ${money(p.revenueDay).padStart(8)} q ${p.quality.toFixed(2)} dbt ${p.techDebt.toFixed(2)} rel ${p.reliability.toFixed(2)} ent ${p.enterpriseReady.toFixed(2)}`);
}
console.log('contracts', state.contracts.length, money(state.contracts.reduce((a, c) => a + c.revenueDay, 0)));
console.log('payroll', money(state.stats.payrollDay), 'infra', money(state.stats.infraDay), 'mkt', money(state.stats.marketingDay), 'rent', money(state.stats.rentDay), 'misc', money(state.stats.miscDay));
console.log('roles', Object.entries(state.employees.reduce((a, e) => ({ ...a, [e.role]: (a[e.role] || 0) + 1 }), {})).map(([k, v]) => `${k}:${v}`).join(' '));
