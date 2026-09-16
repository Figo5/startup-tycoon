import test from 'node:test';
import assert from 'node:assert/strict';
import { game, mods, run, launch } from './helpers.js';
import { step } from '../src/sim/engine.js';
import { computeWorkforce } from '../src/sim/workforce.js';
import { tickInfra, effectiveCapacity, setCapacity, computeLoad } from '../src/sim/infra.js';
import { valuation, addContract } from '../src/sim/economy.js';
import { liveProducts, totalCustomers } from '../src/sim/products.js';

test('a launched product generates revenue and paying customers', () => {
  const s = game(1);
  const p = launch(s);
  assert.equal(p.stage, 'live');
  assert.ok(p.users > 0, 'seeded with users at launch');
  run(s, 30);
  assert.ok(p.revenueDay > 0, `expected revenue, got ${p.revenueDay}`);
  assert.ok(totalCustomers(p) > 0, 'expected paying customers');
  assert.ok(s.stats.revenueDay >= p.revenueDay - 1e-6);
});

test('payroll is charged daily and scales with salaries', () => {
  const s = game(2);
  const before = computeWorkforce(s, mods(s)).payrollDay;
  assert.equal(before, 0, 'the founder takes no salary');
  s.employees.push({ ...s.employees[0], id: 'e1', role: 'engineer', salary: 365000, morale: 0.8 });
  const after = computeWorkforce(s, mods(s)).payrollDay;
  assert.ok(Math.abs(after - 1000) < 1, `expected ~$1000/day, got ${after}`);
});

test('cash falls by net burn over time', () => {
  const s = game(3);
  s.company.marketingBudget = 0;
  const start = s.company.cash;
  run(s, 10);
  assert.ok(s.company.cash < start, 'rent and overheads must cost money');
  assert.ok(s.company.cash > 0, 'ten days should not bankrupt a fresh company');
});

test('infrastructure cost tracks capacity and reliability degrades when overloaded', () => {
  const s = game(4);
  launch(s);
  setCapacity(s, 40);
  const m = mods(s);
  const cost = tickInfra(s, m, computeWorkforce(s, m), 1, null);
  assert.ok(cost > 0, 'capacity costs money');
  assert.ok(Math.abs(cost - 40 * 3.2) < 1, `expected ~${40 * 3.2}, got ${cost}`);

  s.products[0].users = 1e6;           // far beyond capacity
  setCapacity(s, 4);
  for (let i = 0; i < 20; i++) tickInfra(s, mods(s), computeWorkforce(s, mods(s)), 1, null);
  assert.ok(s.infra.reliability < 0.7, `overload should hurt reliability, got ${s.infra.reliability}`);
});

test('valuation responds to revenue', () => {
  const s = game(5);
  s.stats.revenueDay = 0;
  const low = valuation(s, mods(s));
  s.stats.revenueDay = 10000;
  assert.ok(valuation(s, mods(s)) > low * 2, 'more revenue must be worth more');
});

test('enterprise contracts add revenue and support load', () => {
  const s = game(6);
  launch(s);
  run(s, 5);
  const c = addContract(s, mods(s), { name: 'Acme', sizeMul: 2 });
  assert.ok(c.revenueDay > 0 && c.supportLoad > 0);
  const before = s.stats.revenueDay;
  run(s, 1);
  assert.ok(s.stats.revenueDay > before * 0.5);
  assert.ok(s.contracts.length === 1);
});

test('the company never goes hard bankrupt', () => {
  const s = game(7);
  s.company.cash = 50;
  s.company.marketingBudget = 100000;
  run(s, 20);
  assert.ok(s.company.cash >= 0, 'cash is floored at zero');
  assert.equal(s.company.marketingBudget, 0, 'marketing is cut first');
});

test('an unattended overloaded company is rescued by ops rather than spiralling', () => {
  const s = game(8);
  launch(s);
  s.products[0].users = 400000;          // far past the starting capacity
  setCapacity(s, 8);
  const start = s.infra.capacity;
  run(s, 30);
  assert.ok(s.infra.capacity > start * 2, `ops should scale up: ${start} -> ${s.infra.capacity}`);
  assert.ok(s.infra.utilization < 1.2, `utilisation should come back under control: ${s.infra.utilization}`);
  assert.ok(s.infra.reliability > 0.55, `reliability should recover: ${s.infra.reliability}`);
});

test('sizing capacity yourself still beats the emergency backstop', () => {
  const managed = game(9);
  const neglected = game(9);
  for (const s of [managed, neglected]) { launch(s); s.products[0].users = 200000; }
  setCapacity(managed, Math.ceil(computeLoad(managed) / 0.7));
  setCapacity(neglected, 8);
  run(managed, 20);
  run(neglected, 20);
  assert.ok(managed.infra.reliability > neglected.infra.reliability,
    `managed ${managed.infra.reliability} vs neglected ${neglected.infra.reliability}`);
});
