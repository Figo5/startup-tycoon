// Company goals: three on offer, one active, rewarded once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { game, mods, run, launch } from './helpers.js';
import { step } from '../src/sim/engine.js';
import { computeMods } from '../src/sim/modifiers.js';
import {
  goalsSummary, acceptGoal, abandonGoal, tickGoals, goalProgress, goalReady,
  offeredGoals, refreshOfferedGoals, ensureGoals, goalById, goalTech
} from '../src/sim/goals.js';
import { GOALS, OFFERED_GOALS } from '../src/data/goals.js';
import { setCapacity, computeLoad } from '../src/sim/infra.js';
import { serialize, hydrate } from '../src/sim/save.js';

function growingCompany(seed = 161) {
  const s = game(seed);
  launch(s);
  run(s, 1);
  s.company.stage = 'growing';
  s.company.cash = 5e6;
  s.stats.revenueDay = 20000;
  s.stats.valuation = 2e8;
  // A standing contract makes the fixture profitable, so profitability-based
  // goals are about the player's decisions rather than the test setup.
  s.contracts.push({
    id: 'ctr_fixture', name: 'Fixture Contract', revenueDay: 8000, sla: false,
    supportLoad: 0, infraLoad: 0, remaining: 3650, slaBreaches: 0
  });
  return s;
}

test('every goal is completable, one-time and rewards something real', () => {
  for (const g of GOALS) {
    assert.ok(g.name && g.desc && g.unlock, `${g.id} has text and a stage`);
    assert.ok(g.progress, `${g.id} can report progress`);
    assert.ok(g.reward && Object.keys(g.reward).length, `${g.id} rewards something`);
    assert.ok(g.rewardText, `${g.id} describes its reward`);
    const keys = Object.keys(g.reward).filter((k) => k !== 'cash' && k !== 'reputation' && k !== 'founderRep' && k !== 'tech');
    assert.equal(keys.length, 0, `${g.id} rewards only cash, reputation, FR or tech`);
  }
  assert.ok(GOALS.length >= OFFERED_GOALS, 'there is a pool to choose from');
  assert.equal(goalById('nope'), null);
});

test('three goals are offered, and only from stages the company has reached', () => {
  const solo = game(162);
  assert.equal(offeredGoals(solo).length, 0, 'nothing at Solo Founder');
  const seed = growingCompany(163);
  run(seed, 1);
  const offered = refreshOfferedGoals(seed);
  assert.equal(offered.length, OFFERED_GOALS);
  assert.equal(new Set(offered).size, offered.length, 'no duplicates offered');
  for (const id of offered) {
    assert.ok(['seed', 'growing'].includes(goalById(id).unlock), `${id} is reachable now`);
  }
});

test('only one goal is active, and switching is free', () => {
  const s = growingCompany(164);
  refreshOfferedGoals(s);
  const [a, b] = offeredGoals(s);
  assert.ok(acceptGoal(s, a.id).ok);
  assert.equal(ensureGoals(s).active.id, a.id);
  // Accepting a different goal is a switch, not a second slot.
  const switched = acceptGoal(s, b.id);
  assert.ok(switched.ok);
  assert.equal(switched.switchedFrom, a.id);
  assert.equal(ensureGoals(s).active.id, b.id);
  assert.equal(s.company.cash, 5e6, 'switching costs nothing');
  assert.equal(acceptGoal(s, b.id).ok, false, 'the same goal cannot be re-accepted');
  // And dropping it leaves nothing active.
  const dropped = abandonGoal(s);
  assert.ok(dropped.ok);
  assert.equal(dropped.abandoned.id, b.id);
  assert.equal(ensureGoals(s).active, null);
  assert.ok(acceptGoal(s, a.id).ok, 'a dropped goal can be taken again');
});

test('a goal cannot be accepted twice and cannot be faked past its stage', () => {
  const s = growingCompany(165);
  assert.ok(acceptGoal(s, 'growth_push').ok);
  assert.equal(acceptGoal(s, 'growth_push').ok, false);
  const solo = game(166);
  const r = acceptGoal(solo, 'product_company');
  assert.equal(r.ok, false);
  assert.match(r.reason, /growing/i);
});

test('completing a goal pays its reward exactly once', () => {
  const meta = { founderRep: 0, lifetimeRep: 0 };
  const s = growingCompany(167);
  s.meta = { ...s.meta, founderRep: 0, lifetimeRep: 0 };
  assert.ok(acceptGoal(s, 'enterprise_push').ok);
  const cash = s.company.cash;
  const rep = s.company.reputation;
  s.products[0].customers.enterprise = 6;
  const first = tickGoals(s, mods(s), 0.05, null);
  assert.ok(first, 'the goal completed');
  const reward = goalById('enterprise_push').reward;
  assert.equal(s.company.cash - cash, reward.cash);
  assert.ok(Math.abs(s.company.reputation - rep - reward.reputation) < 1e-9);
  assert.equal(ensureGoals(s).active, null);
  assert.deepEqual(ensureGoals(s).completed, ['enterprise_push']);
  assert.equal(goalTech(s).contractSize, reward.tech.contractSize);
  // Spamming the tick must not pay again, however many times it runs.
  for (let i = 0; i < 200; i++) tickGoals(s, mods(s), 0.05, null);
  assert.equal(s.company.cash - cash, reward.cash);
  assert.equal(ensureGoals(s).completed.length, 1);
  assert.equal(goalTech(s).contractSize, reward.tech.contractSize);
  assert.equal(offeredGoals(s).some((g) => g.id === 'enterprise_push'), false, 'never offered again');
  assert.ok(meta.founderRep === 0);
});

test('a Founder Reputation reward is banked once, and never negative', () => {
  const s = growingCompany(168);
  s.meta.founderRep = 4;
  assert.ok(acceptGoal(s, 'lean_machine').ok);
  s.stats.revenueDay = 200000;
  const before = s.meta.founderRep;
  const done = tickGoals(s, mods(s), 0.05, null);
  assert.ok(done);
  assert.equal(s.meta.founderRep, before + goalById('lean_machine').reward.founderRep);
  assert.ok(s.meta.founderRep > 0);
  for (let i = 0; i < 100; i++) tickGoals(s, mods(s), 0.05, null);
  assert.equal(s.meta.founderRep, before + goalById('lean_machine').reward.founderRep);
});

test('a sustained goal counts consecutive days, completes, and resets when broken', () => {
  const s = growingCompany(169);
  assert.ok(acceptGoal(s, 'reliability_leader').ok);
  const keepSized = () => setCapacity(s, Math.max(8, Math.ceil(computeLoad(s) / 0.6)));
  // Keep capacity right-sized, the way a player watching the company would.
  for (let i = 0; i < 200; i++) { keepSized(); step(s, 0.05, null); }
  const tracked = ensureGoals(s).track;
  assert.ok(tracked > 0, `tracked ${tracked} days of reliability`);
  assert.ok(tracked < 15, 'not finished after ten days');
  assert.equal(ensureGoals(s).completed.includes('reliability_leader'), false);
  // Maintained properly, it does complete - the goal is achievable.
  for (let i = 0; i < 900 && !ensureGoals(s).completed.includes('reliability_leader'); i++) {
    keepSized();
    step(s, 0.05, null);
  }
  assert.ok(ensureGoals(s).completed.includes('reliability_leader'), 'the goal is completable');
  assert.equal(ensureGoals(s).track, 0, 'the counter resets when the goal completes');

  // A different sustained goal resets its counter the moment the condition breaks.
  const t = growingCompany(170);
  assert.ok(acceptGoal(t, 'efficiency_drive').ok);
  const tight = () => setCapacity(t, Math.max(8, Math.ceil(computeLoad(t) / 0.35)));
  for (let i = 0; i < 120; i++) { tight(); step(t, 0.05, null); }
  assert.ok(t.stats.netDay > 0, `profitable at ${Math.round(t.stats.netDay)}/day`);
  assert.ok(t.stats.loadRatio < 0.5, `utilisation ${t.stats.loadRatio.toFixed(2)}`);
  assert.ok(ensureGoals(t).track > 0, `efficiency tracked ${ensureGoals(t).track} days`);
  // Squeeze the company: a hundredfold more users on the same tiny capacity
  // puts utilisation over the limit, and the streak drops on the next tick.
  ensureGoals(t).track = 5;
  t.products[0].users = 400000;
  setCapacity(t, 1);
  step(t, 0.05, null);
  assert.ok(t.stats.loadRatio > 0.5, `utilisation ${t.stats.loadRatio.toFixed(2)}`);
  assert.equal(ensureGoals(t).track, 0, 'the streak resets rather than accumulating');
  assert.equal(ensureGoals(t).completed.includes('efficiency_drive'), false);
});

test('goals and their progress survive a save and reload', () => {
  const s = growingCompany(170);
  const g = refreshOfferedGoals(s);
  acceptGoal(s, g[0]);
  const restored = hydrate(serialize(s));
  assert.ok(restored.ok);
  assert.equal(ensureGoals(restored.state).active.id, g[0]);
  assert.deepEqual(ensureGoals(restored.state).offered, ensureGoals(s).offered);
  assert.equal(goalProgress(restored.state, goalById(g[0])).need, goalProgress(s, goalById(g[0])).need);
});

test('a completed goal stays completed across a reload without paying twice', () => {
  const s = growingCompany(171);
  acceptGoal(s, 'enterprise_push');
  s.products[0].customers.enterprise = 6;
  tickGoals(s, mods(s), 0.05, null);
  const cash = s.company.cash;
  const tech = goalTech(s);
  const restored = hydrate(serialize(s));
  assert.ok(restored.ok);
  assert.deepEqual(ensureGoals(restored.state).completed, ['enterprise_push']);
  assert.deepEqual(goalTech(restored.state), tech);
  assert.equal(restored.state.company.cash, cash);
  const again = tickGoals(restored.state, mods(restored.state), 0.05, null);
  assert.equal(again, null);
  assert.equal(restored.state.company.cash, cash);
});

test('goal rewards reach the modifier system', () => {
  const s = growingCompany(172);
  const before = computeMods(s).contractSize || 0;
  acceptGoal(s, 'enterprise_push');
  s.products[0].customers.enterprise = 6;
  tickGoals(s, mods(s), 0.05, null);
  assert.ok((computeMods(s).contractSize || 0) > before, 'the permanent reward is live');
});

test('goal progress reports sane numbers for every goal', () => {
  const s = growingCompany(173);
  for (const def of GOALS) {
    const p = goalProgress(s, def);
    assert.ok(Number.isFinite(p.have) && Number.isFinite(p.need), `${def.id} numbers are finite`);
    assert.ok(p.need > 0);
    assert.ok(p.pct >= 0 && p.pct <= 1, `${def.id} pct inside [0,1]`);
    assert.equal(typeof goalReady(s, def), 'boolean');
  }
  // A goal already met is not offered, so the player is never handed a freebie.
  s.stats.revenueDay = 200000;
  const offered = refreshOfferedGoals(s);
  for (const id of offered) {
    const def = goalById(id);
    assert.equal(goalReady(s, def), false, `${id} is not already complete`);
  }
});
