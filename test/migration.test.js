// Save schema v3 -> v4: nothing is lost, nothing is awarded retroactively, and
// running the migration twice changes nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { game, run, launch } from './helpers.js';
import { newGame, SAVE_VERSION, emptyMeta, normalizeMeta } from '../src/sim/state.js';
import { serialize, hydrate, migrate, applyRunDefaults } from '../src/sim/save.js';
import { computeMods } from '../src/sim/modifiers.js';
import { roadmapChoices, startRoadmap, ensureRoadmap } from '../src/sim/roadmap.js';
import { hireAdvisor, advisorOffers, ensureAdvisors } from '../src/sim/advisors.js';
import { acquireCompany, acquisitionOffers } from '../src/sim/acquisitions.js';
import { acceptGoal, goalsSummary, ensureGoals } from '../src/sim/goals.js';
import { buyPrestige } from '../src/sim/prestige.js';
import { step } from '../src/sim/engine.js';

/** A v4 blob with everything the v4 features added stripped back out. */
function asV3(state) {
  const blob = serialize(state);
  blob.version = 3;
  const s = blob.state;
  delete s.exitResult;
  delete s.advisors;
  delete s.goals;
  delete s.acquisitions;
  delete s.company.ownership;
  delete s.events.lastEventId;
  delete s.events.recentCats;
  for (const p of s.products) {
    delete p.roadmap;
    delete p.acqMul; delete p.revMul; delete p.churnMul; delete p.convMul;
  }
  delete blob.meta.appliedTx;
  return blob;
}

function livedInCompany(seed = 201) {
  const s = game(seed);
  launch(s);
  run(s, 30);
  const mgr = { ...s.employees[0], id: 'emp_m1', role: 'manager', isManager: true, dept: 'engineering', salary: 160000 };
  s.employees.push(mgr);
  s.departments.engineering.managerId = mgr.id;
  s.company.cash = 4e6;
  s.company.stage = 'growing';
  s.office.tier = 'loft';
  s.office.rooms = ['meeting', 'breakroom'];
  s.research.completed = ['ci_cd'];
  s.funding.rounds = [{ id: 'angel', cash: 1e6, equity: 0.12, day: 4, valuation: 8e6 }];
  s.company.founderEquity = 0.88;
  s.company.totalRaised = 1e6;
  s.events.pending = [{ id: 'evt_1', eventId: 'press', day: 20, expiresDay: 26, subject: null }];
  s.events.seen = { press: 2, outage: 1 };
  s.meta.runs = [{ company: 'Old Co', exit: 'Acquisition', value: 1e8, proceeds: 5e7, equity: 0.5, rep: 9, days: 300, stage: 'late', scenario: 'standard', at: 1 }];
  s.meta.founderRep = 11;
  s.meta.lifetimeRep = 20;
  s.meta.upgrades = { capital: 2, lean_ops: 1 };
  s.meta.achievements = ['bootstrapped'];
  s.meta.unlockedScenarios = ['standard', 'crowded'];
  return s;
}

test('a v3 save migrates to v4 with every existing value preserved', () => {
  const original = livedInCompany();
  const blob = asV3(original);
  const before = JSON.parse(JSON.stringify(original));
  const r = hydrate(blob);
  assert.ok(r.ok, r.reason);
  const s = r.state;
  assert.equal(s.version, SAVE_VERSION);
  assert.equal(s.company.cash, before.company.cash);
  assert.equal(s.company.founderEquity, before.company.founderEquity);
  assert.equal(s.company.totalRaised, before.company.totalRaised);
  assert.equal(s.time.day, before.time.day);
  assert.equal(s.employees.length, before.employees.length);
  assert.equal(s.products.length, before.products.length);
  assert.equal(s.products[0].name, before.products[0].name);
  assert.equal(s.products[0].users, before.products[0].users);
  assert.equal(s.office.tier, 'loft');
  assert.deepEqual(s.office.rooms, ['meeting', 'breakroom']);
  assert.deepEqual(s.research.completed, ['ci_cd']);
  assert.equal(s.funding.rounds.length, 1);
  assert.equal(s.departments.engineering.managerId, 'emp_m1');
  assert.deepEqual(s.events.seen, { press: 2, outage: 1 });
  assert.equal(s.events.pending.length, 1);
  assert.equal(s.meta.founderRep, 11);
  assert.equal(s.meta.lifetimeRep, 20);
  assert.deepEqual(s.meta.upgrades, { capital: 2, lean_ops: 1, founder_skill: 0, brand_equity: 0,
    talent_network: 0, veteran_team: 0, cloud_credits: 0, market_insight: 0, research_head_start: 0,
    warm_intros: 0, office_lease: 0, playbook: 0, deal_flow: 0, exit_multiple: 0 });
  assert.equal(s.meta.runs.length, 1);
  assert.deepEqual(s.meta.achievements, ['bootstrapped']);
  assert.deepEqual(s.meta.unlockedScenarios, ['standard', 'crowded']);
  // The upgraded research head start still applies through the modifier path.
  assert.ok(computeMods(s).payroll <= 0, 'meta effects still reach the sim');
});

test('migration initialises the new state empty and awards nothing retroactively', () => {
  const r = hydrate(asV3(livedInCompany(202)));
  assert.ok(r.ok);
  const s = r.state;
  assert.equal(s.exitResult, null, 'no invented exit');
  assert.deepEqual(s.advisors, { hired: [], slots: 1 }, 'an empty advisory bench');
  assert.deepEqual(s.goals, { offered: [], active: null, completed: [], offeredDay: -1, track: 0, taken: 0, tech: {} });
  assert.deepEqual(s.acquisitions, { targets: [], completed: [], integrationUntil: 0, assets: [], tech: {} });
  assert.deepEqual(s.company.ownership, { soldTotal: 0.12, transactions: [] });
  assert.deepEqual(s.meta.appliedTx, []);
  assert.equal(s.events.lastEventId, null);
  assert.deepEqual(s.events.recentCats, []);
  for (const p of s.products) {
    assert.deepEqual(p.roadmap, { active: null, history: [], auto: false }, 'roadmap starts idle and manual');
    assert.equal(p.acqMul, 0);
    assert.equal(p.revMul, 0);
    assert.equal(p.churnMul, 0);
    assert.equal(p.convMul, 0);
  }
});

test('the migration is idempotent', () => {
  const first = hydrate(asV3(livedInCompany(203)));
  const twice = hydrate(serialize(first.state));
  assert.ok(first.ok && twice.ok);
  assert.deepEqual(twice.state, first.state, 'loading a migrated save changes nothing');
  const blob = asV3(livedInCompany(204));
  const a = migrate(structuredClone(blob));
  const b = migrate(structuredClone(a));
  assert.deepEqual(b, a);
  assert.deepEqual(applyRunDefaults(a.state), a.state);
});

test('a migrated save keeps playing: the engine steps it without errors', () => {
  const r = hydrate(asV3(livedInCompany(205)));
  assert.ok(r.ok);
  const s = r.state;
  const day = s.time.day;
  for (let i = 0; i < 400; i++) step(s, 0.05, null);
  assert.ok(s.time.day > day);
  assert.ok(Number.isFinite(s.company.cash));
  assert.ok(Number.isFinite(s.stats.valuation));
  assert.ok(s.products.every((p) => Number.isFinite(p.users) && p.users >= 0));
  assert.ok(ensureRoadmap(s.products[0]).auto === false);
});

test('a migrated save can use every new system', () => {
  const r = hydrate(asV3(livedInCompany(206)));
  const s = r.state;
  s.company.cash = 5e8;
  s.company.stage = 'scaleup';
  s.stats.valuation = 1e9;
  const m = computeMods(s);
  const p = s.products[0];
  const pick = roadmapChoices(s, p).filter((c) => c.available)[0];
  assert.ok(pick, 'a roadmap initiative is available after migration');
  assert.ok(startRoadmap(s, m, p.id, pick.id).ok);
  assert.ok(hireAdvisor(s, advisorOffers(s).find((a) => a.available).id).ok);
  assert.equal(ensureAdvisors(s).hired.length, 1);
  // Targets are generated by the engine tick, exactly as they are in play.
  step(s, 0.05, null);
  const target = acquisitionOffers(s).find((t) => t.available);
  assert.ok(target, 'a company is for sale after migration');
  assert.ok(acquireCompany(s, m, target.id).ok);
  assert.ok(acceptGoal(s, goalsSummary(s).offered[0].id).ok);
  assert.equal(ensureGoals(s).active !== null, true);
});

test('out-of-range values in an old save are repaired rather than trusted', () => {
  const s = livedInCompany(207);
  const blob = asV3(s);
  blob.state.company.founderEquity = -0.4;
  blob.meta.upgrades = { capital: 99, lean_ops: -3 };
  blob.meta.founderRep = -50;
  const r = hydrate(blob);
  assert.ok(r.ok);
  assert.equal(r.state.company.founderEquity, 0, 'negative ownership is clamped');
  assert.equal(r.state.company.ownership.soldTotal, 1);
  assert.equal(r.state.meta.upgrades.capital, 5, 'an impossible level is clamped to its maximum');
  assert.equal(r.state.meta.upgrades.lean_ops, 0);
  assert.equal(r.state.meta.founderRep, 0);
  const buy = buyPrestige(r.state.meta, 'capital');
  assert.equal(buy.ok, false);
});

test('a settled run reloads settled, and its summary survives', () => {
  const s = livedInCompany(208);
  s.exitResult = { id: 'ipo', name: 'IPO', day: 300, value: 1e9, equity: 0.6, proceeds: 6e8, rep: 42, achievements: ['went_public'] };
  s.company.founderEquity = 0;
  const blob = asV3(s);
  delete blob.state.exitResult;                       // v3 has no exit record...
  blob.state.time.paused = false;
  const r = hydrate(blob);
  assert.ok(r.ok);
  assert.equal(r.state.exitResult, null, 'an old save with no exit record is not given one');
  assert.equal(r.state.time.paused, false);
  // And a v4 save carrying an exit stays ended on load.
  const v4 = serialize(s);
  const back = hydrate(v4);
  assert.ok(back.ok);
  assert.equal(back.state.exitResult.rep, 42);
  assert.equal(back.state.time.paused, true);
});

test('the version guard still works', () => {
  const blob = asV3(livedInCompany(209));
  blob.version = SAVE_VERSION + 1;
  assert.equal(hydrate(blob).ok, false);
  assert.match(hydrate(blob).reason, /newer build/i);
  const ancient = { version: 1, savedAt: Date.now(), idCounter: 5, meta: emptyMeta(), state: structuredClone(serialize(newGame({ seed: 9 })).state) };
  ancient.state.company.cash = 1234;
  const r = hydrate(ancient);
  assert.ok(r.ok);
  assert.equal(r.state.version, SAVE_VERSION);
  assert.equal(r.state.company.cash, 1234);
});

test('normalizeMeta is safe on junk', () => {
  const m = normalizeMeta({ founderRep: 'lots', lifetimeRep: null, upgrades: null, runs: 'no', appliedTx: 5 });
  assert.equal(m.founderRep, 0);
  assert.equal(m.lifetimeRep, 0);
  assert.deepEqual(m.runs, []);
  assert.deepEqual(m.appliedTx, []);
  assert.ok(m.upgrades.capital === 0);
  assert.deepEqual(m.unlockedScenarios, ['standard']);
  const same = normalizeMeta(m);
  assert.equal(same, m, 'the same object is returned so UI references stay valid');
});
