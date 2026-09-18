// Product roadmaps: one initiative at a time, charged once, effects applied once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { game, mods, run, launch } from './helpers.js';
import { step } from '../src/sim/engine.js';
import { serialize, hydrate } from '../src/sim/save.js';
import {
  roadmapChoices, startRoadmap, cancelRoadmap, roadmapProgress, ensureRoadmap,
  tickRoadmaps, applyRoadmapEffects, initiativeEffort, suggestRoadmap, autoStartRoadmaps, deptShortfall,
  INITIATIVE_COMMIT, initiativeBudget, initiativesLeft, initiativesShipped, initiativesUsed,
  initiativesInFlight, activeInitiatives
} from '../src/sim/roadmap.js';
import { distributeEngineering } from '../src/sim/products.js';
import { ROADMAPS, roadmapById, ROADMAP_CATEGORIES } from '../src/data/roadmaps.js';
import { computeWorkforce } from '../src/sim/workforce.js';

function liveCompany(seed = 91, stage = 'seed') {
  const s = game(seed);
  launch(s);
  run(s, 1);
  s.company.stage = stage;
  s.company.cash = 3e6;
  return s;
}

function runUntilIdle(s, limit = 12000) {
  const p = s.products[0];
  for (let i = 0; i < limit && ensureRoadmap(p).active; i++) step(s, 0.05, null);
  return s;
}

test('the roadmap table is wired: every effect key is one the simulation reads', () => {
  const KNOWN = new Set(['acqMul', 'revMul', 'churnMul', 'convMul', 'quality', 'reliability',
    'security', 'enterpriseReady', 'techDebt', 'infraEff', 'supportLoadMod', 'marketBonus']);
  for (const r of ROADMAPS) {
    assert.ok(ROADMAP_CATEGORIES.some((c) => c.id === r.cat), `${r.id} has a category`);
    assert.ok(r.cost > 0 && r.work > 0, `${r.id} has a cost and a work value`);
    for (const k of Object.keys(r.effects)) assert.ok(KNOWN.has(k), `${r.id}: ${k} is read by the sim`);
  }
  assert.equal(roadmapById('referral').name, 'Referral System');
  assert.equal(roadmapById('nope'), null);
});

test('an initiative starts once, charges once, and cannot be started twice', () => {
  const s = liveCompany();
  const m = mods(s);
  const p = s.products[0];
  const pick = roadmapChoices(s, p).filter((c) => c.available)[0];
  assert.ok(pick, 'something is available');
  const cash = s.company.cash;
  const first = startRoadmap(s, m, p.id, pick.id);
  assert.ok(first.ok);
  assert.equal(s.company.cash, cash - pick.cost, 'charged the listed price, once');
  const again = startRoadmap(s, m, p.id, pick.id);
  assert.equal(again.ok, false, 'the same initiative cannot be started again');
  const other = roadmapChoices(s, p).filter((c) => c.available)[0];
  assert.equal(other, undefined, 'no second initiative while one is running');
  assert.equal(s.company.cash, cash - pick.cost, 'the refused starts cost nothing');
});

test('an unaffordable initiative is refused without charging anything', () => {
  const s = liveCompany(92);
  const p = s.products[0];
  s.company.cash = 10;
  const pick = roadmapChoices(s, p).find((c) => c.cost > 10);
  assert.equal(pick.available, false);
  const r = startRoadmap(s, mods(s), p.id, pick.id);
  assert.equal(r.ok, false);
  assert.equal(s.company.cash, 10);
  assert.equal(ensureRoadmap(p).active, null);
});

test('progress accumulates with staff, and completion applies the effects exactly once', () => {
  const s = liveCompany(93);
  const m = mods(s);
  const p = s.products[0];
  const pick = roadmapChoices(s, p).filter((c) => c.available).find((c) => c.id === 'referral');
  assert.ok(pick, 'referral is available at this stage');
  const before = { acqMul: p.acqMul || 0, convMul: p.convMul || 0 };
  startRoadmap(s, m, p.id, pick.id);
  const early = roadmapProgress(p);
  assert.ok(early.pct >= 0 && early.pct < 1);
  assert.ok(initiativeEffort(s, m, computeWorkforce(s, m)) > 0, 'effort is driven by staff');
  runUntilIdle(s);
  assert.ok(ensureRoadmap(p).history.includes('referral'), 'recorded as shipped');
  assert.equal(ensureRoadmap(p).active, null);
  assert.ok(Math.abs((p.acqMul || 0) - before.acqMul - pick.effects.acqMul) < 1e-9);
  assert.ok(Math.abs((p.convMul || 0) - before.convMul - pick.effects.convMul) < 1e-9);
  // Running on must not apply the effect again.
  for (let i = 0; i < 400; i++) step(s, 0.05, null);
  assert.ok(Math.abs((p.acqMul || 0) - before.acqMul - pick.effects.acqMul) < 1e-9);
  assert.equal(ensureRoadmap(p).history.filter((x) => x === 'referral').length, 1);
  assert.equal(roadmapChoices(s, p).find((c) => c.id === 'referral').available, false);
});

test('a completed roadmap survives save and reload without re-applying', () => {
  const s = liveCompany(94);
  const p = s.products[0];
  const pick = roadmapChoices(s, p).filter((c) => c.available)[0];
  startRoadmap(s, mods(s), p.id, pick.id);
  runUntilIdle(s);
  const key = Object.keys(pick.effects)[0];
  const value = p[key];
  const restored = hydrate(serialize(s));
  assert.ok(restored.ok);
  const p2 = restored.state.products[0];
  assert.ok(Math.abs((p2[key] || 0) - (value || 0)) < 1e-9, `${key} is still there, exactly once`);
  assert.ok(ensureRoadmap(p2).history.includes(pick.id));
  assert.equal(ensureRoadmap(p2).active, null);
  assert.equal(roadmapChoices(restored.state, p2).find((c) => c.id === pick.id).available, false);
});

test('prerequisites are enforced: stage, department size and product stage', () => {
  const early = liveCompany(95, 'tiny');
  const p = early.products[0];
  const gated = roadmapChoices(early, p).find((c) => c.id === 'mobile_launch');
  assert.equal(gated.available, false);
  assert.match(gated.reason, /stage/i);

  const thin = liveCompany(96, 'growing');
  const big = roadmapChoices(thin, thin.products[0]).find((c) => c.id === 'performance_rewrite');
  assert.equal(big.available, false);
  assert.match(big.reason, /engineering/i);
  assert.ok(deptShortfall(thin, roadmapById('performance_rewrite')));

  const building = game(97);
  assert.equal(building.products[0].stage, 'development');
  assert.equal(roadmapChoices(building, building.products[0]).every((c) => !c.available), true);
  assert.match(roadmapChoices(building, building.products[0])[0].reason, /ship/i);
});

test('cancelling keeps the fee and frees the slot', () => {
  const s = liveCompany(98);
  const p = s.products[0];
  const pick = roadmapChoices(s, p).filter((c) => c.available)[0];
  startRoadmap(s, mods(s), p.id, pick.id);
  const cash = s.company.cash;
  const r = cancelRoadmap(s, p.id);
  assert.ok(r.ok);
  assert.equal(s.company.cash, cash, 'no refund');
  assert.equal(ensureRoadmap(p).active, null);
  assert.equal(ensureRoadmap(p).history.includes(pick.id), false, 'not recorded as shipped');
  assert.ok(roadmapChoices(s, p).some((c) => c.available), 'the slot is available again');
  // Restarting it costs the fee a second time, so cancel/restart is never free value.
  const again = startRoadmap(s, mods(s), p.id, pick.id);
  assert.ok(again.ok);
  assert.equal(s.company.cash, cash - pick.cost);
});

test('a run has a bounded number of initiatives, and the cap is enforced', () => {
  const s = liveCompany(103, 'seed');
  s.company.cash = 5e7;
  const m = mods(s);
  const budget = initiativeBudget(s);
  assert.ok(budget > 0 && budget <= 12, `seed budget ${budget}`);
  // Two live products so effort is shared and planning is a real choice.
  s.products.push({
    ...s.products[0], id: 'prd_b2', name: 'Second', category: 'saas', stage: 'live', users: 500,
    projects: [], completed: [], roadmap: undefined,
    customers: { consumer: 0, smb: 0, midmarket: 0, enterprise: 0 }
  });
  let shipped = 0;
  let guard = 0;
  while (guard++ < 40) {
    let started = false;
    for (const p of s.products) {
      if (ensureRoadmap(p).active) continue;
      const pick = roadmapChoices(s, p).filter((c) => c.available)[0];
      if (!pick) continue;
      const r = startRoadmap(s, m, p.id, pick.id);
      if (r.ok) started = true;
    }
    if (!started && !activeInitiatives(s).length) break;
    for (let i = 0; i < 4000 && activeInitiatives(s).length; i++) step(s, 0.05, null);
  }
  shipped = initiativesShipped(s);
  // The allowance grows with the stage, so the running total is checked against
  // the budget in force now - never above it, and never below the starting one.
  const finalBudget = initiativeBudget(s);
  assert.ok(shipped <= finalBudget, `shipped ${shipped} against a budget of ${finalBudget}`);
  assert.ok(shipped >= budget, `shipped ${shipped}, expected at least the starting ${budget}`);
  assert.equal(initiativesLeft(s), Math.max(0, finalBudget - initiativesUsed(s)));
  assert.equal(initiativesUsed(s), initiativesShipped(s) + initiativesInFlight(s));
  for (const p of s.products) {
    const choice = roadmapChoices(s, p).filter((c) => !c.done && !c.active)[0];
    if (!choice) continue;
    assert.equal(choice.available, false, 'no further initiative is offered');
    assert.match(choice.reason, /capacity/i);
    assert.equal(startRoadmap(s, m, p.id, choice.id).ok, false, 'and the start is refused');
  }
  // Capacity returns as the company grows: the cap is stage-based, not a wall.
  s.company.stage = 'late';
  assert.ok(initiativeBudget(s) > budget);
  assert.ok(initiativesLeft(s) > 0);
});

test('a manager keeps an opted-in roadmap moving, and only cheap ones', () => {
  const s = liveCompany(99, 'growing');
  s.company.cash = 4e6;
  const p = s.products[0];
  const manager = { ...s.employees[0], id: 'emp_mgr', role: 'manager', isManager: true, dept: 'engineering', salary: 150000, morale: 0.9 };
  s.employees.push(manager);
  s.departments.engineering.managerId = manager.id;
  const m = mods(s);
  // Default is manual: nothing starts until the player opts in.
  assert.equal(ensureRoadmap(p).auto, false);
  autoStartRoadmaps(s, m, null, true);
  assert.equal(ensureRoadmap(p).active, null, 'no automatic work without opt-in');
  assert.equal(s.company.cash, 4e6, 'and nothing is spent');

  ensureRoadmap(p).auto = true;
  const pick = suggestRoadmap(s, p);
  assert.ok(pick, 'a conservative option is suggested');
  assert.ok(pick.conservative, 'automation only ever picks the safe initiatives');
  assert.ok(pick.cost <= s.company.cash * 0.5, 'the automatic pick is cheap relative to cash');
  autoStartRoadmaps(s, m, null, true);
  assert.ok(ensureRoadmap(p).active, 'automation started an initiative');
  const started = ensureRoadmap(p).active.id;
  autoStartRoadmaps(s, m, null, true);
  assert.equal(ensureRoadmap(p).active.id, started, 'it does not restart or stack');
});

test('automatic roadmaps do nothing when the company cannot afford them', () => {
  const s = liveCompany(100, 'growing');
  s.company.cash = 500;
  const p = s.products[0];
  const manager = { ...s.employees[0], id: 'emp_mgr2', role: 'manager', isManager: true, dept: 'engineering', salary: 150000 };
  s.employees.push(manager);
  s.departments.engineering.managerId = manager.id;
  ensureRoadmap(p).auto = true;
  autoStartRoadmaps(s, mods(s), null, true);
  assert.equal(ensureRoadmap(p).active, null);
  assert.equal(s.company.cash, 500, 'nothing was spent');
});

test('an active initiative takes engineering away from the product queue', () => {
  const s = liveCompany(102, 'growing');
  s.company.cash = 3e6;
  const m = mods(s);
  assert.equal(m.initiativeCommit, 0, 'nothing is committed while the roadmap is idle');
  const p = s.products[0];
  const pick = roadmapChoices(s, p).filter((c) => c.available)[0];
  // Give both products queued work so the distribution actually runs.
  p.projects.push({ id: 'prj_x', typeId: 'feature', name: 'Feature', work: 100000, done: 0 });
  startRoadmap(s, m, p.id, pick.id);
  const withRoadmap = mods(s);
  assert.equal(withRoadmap.initiativeCommit, INITIATIVE_COMMIT);
  const before = p.projects[0].done;
  distributeEngineering(s, withRoadmap, computeWorkforce(s, withRoadmap), 1);
  const withWork = p.projects[0].done - before;
  p.projects[0].done = before;
  const idleMods = { ...withRoadmap, initiativeCommit: 0 };
  distributeEngineering(s, idleMods, computeWorkforce(s, idleMods), 1);
  const withoutWork = p.projects[0].done - before;
  assert.ok(withWork < withoutWork, `project work ${withWork.toFixed(2)} < ${withoutWork.toFixed(2)}`);
  const expected = withoutWork * (1 - INITIATIVE_COMMIT);
  assert.ok(Math.abs(withWork - expected) < 0.01, `the commitment is exactly ${INITIATIVE_COMMIT * 100}%`);
});

test('two products split the same initiative effort rather than doubling it', () => {
  const s = liveCompany(101, 'growing');
  s.company.cash = 3e7;
  s.products.push({
    ...s.products[0], id: 'prd_second', name: 'Second', category: 'saas', stage: 'live',
    users: 1000, projects: [], completed: [], roadmap: undefined,
    customers: { consumer: 0, smb: 0, midmarket: 0, enterprise: 0 }
  });
  const m = mods(s);
  const wf = computeWorkforce(s, m);
  const [a, b] = s.products;
  const options = (p) => roadmapChoices(s, p).filter((c) => c.available).slice(0, 2);
  const pickA = options(a)[0];
  startRoadmap(s, m, a.id, pickA.id);
  const soloPerStep = (() => {
    const s1 = JSON.parse(JSON.stringify(ensureRoadmap(a).active.done));
    tickRoadmaps(s, m, wf, 1, null);
    return ensureRoadmap(a).active.done - s1;
  })();
  const pickB = options(b).find((c) => c.id === pickA.id) || options(b)[0];
  startRoadmap(s, m, b.id, pickB.id);
  const beforeA = ensureRoadmap(a).active.done;
  tickRoadmaps(s, m, wf, 1, null);
  const bothPerStep = ensureRoadmap(a).active.done - beforeA;
  assert.ok(Math.abs(bothPerStep - soloPerStep / 2) < 1e-9,
    `one initiative ${soloPerStep.toFixed(3)}/day, two ${bothPerStep.toFixed(3)}/day`);
});

test('applyRoadmapEffects clamps every product field it touches', () => {
  const p = { quality: 0.9, reliability: 0.95, techDebt: 2.9, infraEff: 0.7, enterpriseReady: 0.95 };
  applyRoadmapEffects(p, { quality: 0.5, reliability: 0.5, techDebt: 0.5, infraEff: 0.5, enterpriseReady: 0.5 });
  assert.equal(p.quality, 1);
  assert.equal(p.reliability, 1);
  assert.equal(p.enterpriseReady, 1);
  assert.equal(p.techDebt, 3);
  assert.equal(p.infraEff, 0.8);
  applyRoadmapEffects(p, { infraEff: -5, techDebt: -9 });
  assert.equal(p.infraEff, -0.6);
  assert.equal(p.techDebt, 0);
});
