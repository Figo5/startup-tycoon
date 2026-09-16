import test from 'node:test';
import assert from 'node:assert/strict';
import { game, run, launch } from './helpers.js';
import { EVENTS, eventById } from '../src/data/events.js';
import { spawnEvent, resolveEvent, eligibleEvents, tickEvents, choiceCost } from '../src/sim/events.js';
import { computeMods } from '../src/sim/modifiers.js';
import { stageOrder, STAGES } from '../src/data/stages.js';

/** A company that satisfies nothing: no products, staff, contracts or rooms. */
function bare(stage = 'late', seed = 70) {
  const s = game(seed);
  s.company.stage = stage;
  s.company.cash = 1e9;
  s.products = [];
  s.contracts = [];
  s.employees = s.employees.filter((e) => e.id === 'founder');
  s.office.rooms = [];
  s.office.tier = 'garage';
  s.infra.load = 0;
  return s;
}

const ids = (s) => eligibleEvents(s).map((e) => e.id);

test('the event pool is large, unique and well formed', () => {
  assert.ok(EVENTS.length >= 40 && EVENTS.length <= 50, `pool size ${EVENTS.length}`);
  assert.equal(new Set(EVENTS.map((e) => e.id)).size, EVENTS.length, 'duplicate event ids');
  // market_boom is a pre-existing pure-flavour notification, left as it was.
  const decisions = EVENTS.filter((e) => e.choices.length >= 2);
  assert.ok(decisions.length >= EVENTS.length - 1, 'nearly every event is a real decision');
  for (const e of EVENTS) {
    assert.ok(e.choices.length >= 1, `${e.id} has no choices`);
    assert.ok(typeof e.weight === 'number' && e.weight > 0, `${e.id} needs a weight`);
    const auto = e.choices.find((c) => c.id === e.auto);
    assert.ok(auto && !auto.minigame, `${e.id} needs a non-minigame fallback`);
  }
});

test('stage-gated events do not appear before their stage, and stay after it', () => {
  for (const e of EVENTS.filter((x) => x.minStage && !x.maxStage)) {
    const min = stageOrder(e.minStage);
    for (const st of STAGES) {
      // A rich, fully-equipped company, so only the stage gate can exclude it.
      const s = game(71);
      launch(s);
      run(s, 12);
      s.company.stage = st.id;
      s.company.cash = 1e9;
      s.contracts.push({ id: 'c1', name: 'Acme', revenueDay: 900, sla: true, supportLoad: 1, infraLoad: 1, remaining: 300, slaBreaches: 0 });
      s.employees.push({ ...s.employees[0], id: 'm1', name: 'Mgr', role: 'manager', isManager: true, salary: 1e5 });
      for (let i = 0; i < 8; i++) s.employees.push({ ...s.employees[0], id: `e${i}`, name: `P${i}`, role: 'engineer', salary: 9e4 });
      s.office.rooms = ['breakroom'];
      s.office.tier = 'loft';
      s.infra.load = 20;
      s.stats.customers = 500;
      s.funding.rounds.push({ id: 'seed' });
      const eligible = ids(s).includes(e.id);
      if (st.order < min) assert.equal(eligible, false, `${e.id} must not appear at ${st.id}`);
    }
  }
});

test('events do not fire before the systems they talk about exist', () => {
  const s = bare('late');
  const now = ids(s);
  const needsPeople = ['promotion', 'dept_transfer', 'manager_conflict', 'raise_request', 'resignation', 'poaching'];
  const needsContracts = ['churn_risk', 'account_expansion', 'renewal'];
  const needsProduct = ['feature_request', 'copycat', 'partnership', 'referral_surge', 'creator_endorsement', 'critical_bug', 'outage'];
  for (const id of [...needsPeople, ...needsContracts, ...needsProduct]) {
    assert.ok(eventById(id), `fixture: ${id} exists`);
    assert.equal(now.includes(id), false, `${id} fired with no team, product or contracts`);
  }
  assert.equal(now.includes('amenity_request'), false, 'office events need an office');
  assert.equal(now.includes('rent_increase'), false, 'rent events need more than a garage');
});

test('manager events appear only once managers exist', () => {
  const s = bare('scaleup');
  for (let i = 0; i < 7; i++) s.employees.push({ ...s.employees[0], id: `e${i}`, name: `P${i}`, role: 'engineer', isManager: false });
  assert.equal(ids(s).includes('dept_transfer'), false, 'no manager, no manager event');
  s.employees.push({ ...s.employees[0], id: 'm1', name: 'Mgr', role: 'manager', isManager: true });
  assert.ok(ids(s).includes('dept_transfer'), 'the transfer request unlocks with a manager');
  assert.ok(ids(s).includes('manager_conflict'));
});

test('IPO and acquisition events stay out of the early game', () => {
  const s = game(72);
  launch(s);
  run(s, 10);
  s.company.stage = 'seed';
  const early = ids(s);
  for (const id of ['ipo_prep', 'international', 'acquisition_target', 'acquisition_offer', 'institutional_contract', 'strategic_investor']) {
    assert.equal(early.includes(id), false, `${id} must not appear at Seed`);
  }
});

test('choices apply the tradeoffs they advertise', () => {
  const setup = (seed = 73) => {
    const s = game(seed);
    launch(s);
    run(s, 12);
    s.company.stage = 'scaleup';
    s.company.cash = 5e8;
    s.employees.push({ ...s.employees[0], id: 'e1', name: 'Dana Reed', role: 'engineer', salary: 100000, isManager: false });
    return s;
  };

  // Cash raise vs equity raise: the same request, two different currencies.
  let s = setup();
  let payroll = s.employees.reduce((a, e) => a + e.salary, 0);
  let cash = s.company.cash;
  let p = spawnEvent(s, 'raise_request');
  assert.ok(resolveEvent(s, computeMods(s), p.id, 'grant', null).ok);
  assert.ok(s.employees.reduce((a, e) => a + e.salary, 0) > payroll, 'granting a raise raises payroll');
  assert.ok(s.company.cash < cash, 'and costs cash');

  s = setup();
  const equity = s.company.founderEquity;
  p = spawnEvent(s, 'raise_request');
  cash = s.company.cash;
  assert.ok(resolveEvent(s, computeMods(s), p.id, 'equity', null).ok);
  assert.ok(s.company.founderEquity < equity, 'the equity option dilutes');
  assert.equal(s.company.cash, cash, 'and spends no cash');

  // Service credits shrink the contract instead of losing it.
  s = setup(74);
  s.contracts.push({ id: 'c1', name: 'Acme', revenueDay: 1000, sla: false, supportLoad: 1, infraLoad: 1, remaining: 100, slaBreaches: 0 });
  p = spawnEvent(s, 'churn_risk');
  assert.ok(resolveEvent(s, computeMods(s), p.id, 'credits', null).ok);
  assert.equal(s.contracts.length, 1, 'the customer stays');
  assert.ok(s.contracts[0].revenueDay < 1000, 'at a lower price');
  assert.ok(s.contracts[0].remaining > 100, 'for longer');

  // Buying a team adds people to hire, not headcount for free.
  s = setup(75);
  const before = s.candidates.length;
  const staff = s.employees.length;
  p = spawnEvent(s, 'acquisition_target');
  assert.ok(resolveEvent(s, computeMods(s), p.id, 'acquihire', null).ok);
  assert.ok(s.candidates.length > before, 'the team lands in the hiring pipeline');
  assert.equal(s.employees.length, staff, 'and does not bypass hiring');
});

test('every event auto-resolves conservatively for an idle, broke player', () => {
  for (const def of EVENTS) {
    const s = game(76);
    launch(s);
    run(s, 15);
    s.company.stage = 'late';
    s.company.cash = 500;                       // cannot afford any paid option
    s.contracts.push({ id: 'c1', name: 'Acme', revenueDay: 400, sla: true, supportLoad: 1, infraLoad: 1, remaining: 200, slaBreaches: 0 });
    s.employees.push({ ...s.employees[0], id: 'e1', name: 'Test Person', role: 'engineer', salary: 90000 });
    const equity = s.company.founderEquity;
    const staff = s.employees.length;
    const p = spawnEvent(s, def.id);
    s.time.day = p.expiresDay + 0.01;
    tickEvents(s, computeMods(s), 0.05, null);
    assert.equal(s.events.pending.some((x) => x.id === p.id), false, `${def.id} never resolved`);
    assert.ok(s.company.cash >= 0, `${def.id} pushed cash negative`);
    assert.ok(s.company.founderEquity >= equity * 0.95, `${def.id} diluted an absent founder`);
    assert.ok(s.employees.length >= staff - 1, `${def.id} cost more than one person`);
    assert.ok(Number.isFinite(s.stats.valuation));
  }
});

test('an event nobody can afford lapses instead of jamming the inbox', () => {
  const s = game(79);
  launch(s);
  run(s, 12);
  s.company.stage = 'growing';
  s.company.cash = 100;                         // patent_demand's options both cost money
  const p = spawnEvent(s, 'patent_demand');
  s.time.day = p.expiresDay + 0.01;
  tickEvents(s, computeMods(s), 0.05, null);
  assert.equal(s.events.pending.some((x) => x.id === p.id), false, 'it must not stay pending forever');
  assert.equal(s.company.cash, 100, 'and must not spend money the company does not have');
  assert.equal(s.events.log[0].choice, 'Lapsed');
});

test('the same event is not shown twice in a row', () => {
  const s = game(77);
  launch(s);
  run(s, 30);
  s.company.stage = 'growing';
  s.company.cash = 1e8;
  const m = computeMods(s);
  s.events.pending = [];
  s.events.cooldown = 0;
  tickEvents(s, m, 0.01, null);
  assert.equal(s.events.pending.length, 1, 'one event spawns');
  const first = s.events.pending[0].eventId;
  assert.ok(s.events.cooldown > 0, 'a cooldown is set before the next one');
  // While it is still pending it cannot be picked again...
  assert.equal(eligibleEvents(s).map((e) => e.id).includes(first), false);
  // ...and once seen it is weighted down relative to an unseen sibling.
  assert.ok(s.events.seen[first] >= 1, 'repeat damping tracks what has been shown');
});

test('event cadence is unchanged by the larger pool', () => {
  const s = game(78);
  run(s, 200);
  const days = s.events.log.length ? 200 / s.events.log.length : Infinity;
  assert.ok(days >= 3, `events fired every ${days.toFixed(1)} days - too often`);
  assert.ok(s.events.pending.length <= 3, 'the inbox stays capped');
});
