import test from 'node:test';
import assert from 'node:assert/strict';
import { game, mods, run, launch } from './helpers.js';
import { applyMinigameReward } from '../src/ui/ui.js';
import { computeMods } from '../src/sim/modifiers.js';
import { computeWorkforce, setManager, deptMultiplier } from '../src/sim/workforce.js';
import { startOutage } from '../src/sim/infra.js';
import { MINIGAMES } from '../src/minigames/index.js';

test('there are three optional activities and each one pays out', () => {
  assert.equal(Object.keys(MINIGAMES).length, 3);

  const s = game(70);
  launch(s);
  run(s, 5);
  applyMinigameReward(s, mods(s), 'debugging', 1, null);
  const debug = s.boosts.find((b) => b.id === 'mg_debug');
  assert.ok(debug && debug.mods.devSpeed > 0, 'debugging boosts engineering');

  applyMinigameReward(s, mods(s), 'negotiation', 1, null);
  assert.ok(s.boosts.find((b) => b.id === 'mg_negotiation').mods.contractSize > 0);
});

test('a perfect incident run shortens an outage far more than a poor one', () => {
  const good = game(71);
  const bad = game(71);
  launch(good); launch(bad);
  startOutage(good, mods(good), good.products[0], null);
  bad.products[0].outage = good.products[0].outage;
  applyMinigameReward(good, mods(good), 'incident', 1, null);
  applyMinigameReward(bad, mods(bad), 'incident', 0, null);
  assert.ok(good.products[0].outage < bad.products[0].outage * 0.3);
  assert.ok(good.infra.reliability > bad.infra.reliability);
});

test('skipping every minigame still leaves a working company', () => {
  const s = game(72);
  run(s, 300);
  assert.equal(s.boosts.filter((b) => b.id.startsWith('mg_')).length, 0);
  assert.ok(s.stats.revenueDay > 0, 'an idle company still earns');
  assert.ok(s.products[0].stage === 'live');
});

test('a manager measurably multiplies their department', () => {
  const s = game(73);
  for (let i = 0; i < 4; i++) {
    s.employees.push({ ...s.employees[0], id: `e${i}`, role: 'engineer', dept: 'engineering', salary: 90000, skill: 5 });
  }
  const before = computeWorkforce(s, computeMods(s)).byDept.engineering.eng;
  s.employees.push({ ...s.employees[0], id: 'mgr', role: 'manager', isManager: true, dept: 'engineering', salary: 170000, skill: 8 });
  setManager(s, 'engineering', 'mgr');
  const after = computeWorkforce(s, computeMods(s)).byDept.engineering.eng;
  assert.ok(after > before * 1.15, `manager should lift output: ${before} -> ${after}`);
  assert.ok(deptMultiplier(s, computeMods(s), 'engineering') > 1);
});
