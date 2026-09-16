import test from 'node:test';
import assert from 'node:assert/strict';
import { game, mods, run, launch } from './helpers.js';
import { EVENTS, eventById } from '../src/data/events.js';
import { spawnEvent, resolveEvent, choiceCost, eventText, eligibleEvents, tickEvents } from '../src/sim/events.js';
import { computeMods } from '../src/sim/modifiers.js';
import { RESEARCH } from '../src/data/research.js';
import { PROJECT_TYPES, PRODUCT_CATEGORIES } from '../src/data/products.js';
import { STAGES } from '../src/data/stages.js';
import { PRESTIGE_UPGRADES } from '../src/data/prestige.js';

test('content tables meet the v1 targets and have no dangling references', () => {
  assert.ok(PRODUCT_CATEGORIES.length >= 6, 'product categories');
  assert.ok(RESEARCH.length >= 30, `research items: ${RESEARCH.length}`);
  assert.ok(EVENTS.length >= 15, `events: ${EVENTS.length}`);
  assert.equal(STAGES.length, 7);
  assert.ok(PRESTIGE_UPGRADES.length >= 10);

  const rIds = new Set(RESEARCH.map((r) => r.id));
  for (const r of RESEARCH) for (const q of r.req) assert.ok(rIds.has(q), `${r.id} requires missing ${q}`);
  for (const t of PROJECT_TYPES) {
    if (t.requires?.research) assert.ok(rIds.has(t.requires.research), `${t.id} requires missing research`);
  }
  const ids = RESEARCH.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate research ids');
});

test('every event has a valid conservative fallback', () => {
  for (const e of EVENTS) {
    assert.ok(e.choices.length > 0, `${e.id} has no choices`);
    assert.ok(e.choices.some((c) => c.id === e.auto), `${e.id} auto choice ${e.auto} is not one of its choices`);
    const auto = e.choices.find((c) => c.id === e.auto);
    assert.ok(!auto.minigame, `${e.id} must not auto-resolve into a minigame`);
  }
});

test('every event can be spawned, described and resolved through each choice', () => {
  for (const def of EVENTS) {
    for (const choice of def.choices) {
      if (choice.minigame) continue;
      const s = game(60);
      launch(s);
      run(s, 8);
      s.company.stage = 'late';
      s.company.cash = 5e9;
      s.contracts.push({ id: 'c1', name: 'Acme', revenueDay: 500, sla: true, supportLoad: 1, infraLoad: 1, remaining: 300, slaBreaches: 0 });
      s.employees.push({ ...s.employees[0], id: 'e9', name: 'Test Person', salary: 90000, role: 'engineer' });
      const p = spawnEvent(s, def.id);
      assert.ok(typeof eventText(s, p) === 'string');
      const before = s.company.cash;
      const r = resolveEvent(s, computeMods(s), p.id, choice.id, null);
      assert.ok(r.ok, `${def.id}/${choice.id}: ${r.reason}`);
      assert.ok(Number.isFinite(s.company.cash), `${def.id}/${choice.id} produced a non-finite cash value`);
      assert.ok(Number.isFinite(s.company.reputation));
      assert.equal(s.events.pending.some((x) => x.id === p.id), false, `${def.id}/${choice.id} left its event pending`);
    }
  }
});

test('an ignored event resolves without a catastrophic outcome', () => {
  const s = game(61);
  launch(s);
  run(s, 20);
  const cash = s.company.cash;
  const p = spawnEvent(s, 'outage');
  s.time.day = p.expiresDay + 0.01;
  tickEvents(s, computeMods(s), 0.05, null);
  assert.equal(s.events.pending.some((x) => x.id === p.id), false);
  assert.ok(s.company.cash >= cash * 0.5, 'ignoring an event must not wipe out the company');
});

test('events respect their stage gates', () => {
  const s = game(62);
  const early = eligibleEvents(s).map((e) => e.id);
  assert.ok(!early.includes('acquisition_offer'), 'late events are gated');
  s.company.stage = 'scaleup';
  assert.ok(eligibleEvents(s).map((e) => e.id).includes('acquisition_offer'));
  assert.ok(!eligibleEvents(s).map((e) => e.id).includes('accelerator'), 'early-only events expire');
});

test('an unattended company survives a long stretch with events firing', () => {
  const s = game(63);
  run(s, 400);
  assert.ok(s.company.cash >= 0);
  assert.ok(Number.isFinite(s.stats.valuation));
  assert.ok(s.employees.length >= 1, 'the founder is still there');
  assert.ok(s.events.pending.length <= 3);
});
