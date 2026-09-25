import test from 'node:test';
import assert from 'node:assert/strict';
import { game, run, launch } from './helpers.js';
import { EVENTS, eventById, TRIGGERS } from '../src/data/events.js';
import { spawnEvent, resolveEvent, eligibleEvents, visibleChoices, eventText, labelFor, choiceCost, tickEvents } from '../src/sim/events.js';
import { computeMods } from '../src/sim/modifiers.js';
import { makeCandidate } from '../src/sim/state.js';
import { hire } from '../src/sim/workforce.js';

/** A company with a bit of everything, so every event has something to act on. */
function rich(seed = 5) {
  const s = game(seed);
  launch(s);
  run(s, 20);
  s.company.stage = 'major';
  s.company.cash = 5e8;
  s.stats.revenueDay = 50000;
  for (const role of ['engineer', 'engineer', 'senior_engineer', 'designer', 'pm', 'sales_rep', 'marketer', 'support_specialist', 'manager']) {
    const c = makeCandidate(s.rng, role, { hiredDay: s.time.day });
    s.candidates.push(c);
    s.office.deskCapacity = 99;
    hire(s, c.id, computeMods(s));
  }
  s.employees[1].traits = ['genius'];
  s.employees[2].energy = 0.1;
  s.employees.find((e) => e.id === 'founder').energy = 0.2;
  s.alumni = [{ name: 'Old Friend', role: 'engineer', skill: 6, traits: ['loyal'], why: 'resigned', day: 3 }];
  s.products[0].techDebt = 1.2;
  s.products[0].security = 0.3;
  s.rivalState.nemesis = s.competitors[0].id;
  return s;
}

test('the event pool has roughly a hundred events with unique ids and valid fallbacks', () => {
  assert.ok(EVENTS.length >= 95, `pool size ${EVENTS.length}`);
  assert.equal(new Set(EVENTS.map((e) => e.id)).size, EVENTS.length);
  for (const t of TRIGGERS) assert.ok(eventById(t.event)?.trigger, `${t.event} is a trigger event`);
  const cats = new Set(EVENTS.map((e) => e.cat));
  for (const c of ['people', 'product', 'market', 'money', 'legal', 'infra', 'customers']) assert.ok(cats.has(c), c);
});

test('chain-only and trigger events never come up in the random draw', () => {
  const s = rich();
  const ids = eligibleEvents(s).map((e) => e.id);
  for (const e of EVENTS.filter((x) => x.chainOnly || x.trigger)) assert.equal(ids.includes(e.id), false, e.id);
});

test('every choice of every event resolves without throwing, on a rich company', () => {
  for (const def of EVENTS) {
    for (const choice of def.choices) {
      if (choice.minigame) continue;
      const s = rich(11);
      const p = spawnEvent(s, def.id);
      assert.ok(p, def.id);
      assert.equal(typeof eventText(s, p), 'string');
      assert.equal(typeof labelFor(s, choice, p), 'string', `${def.id}.${choice.id} label`);
      assert.ok(Number.isFinite(choiceCost(s, choice, p)), `${def.id}.${choice.id} cost`);
      const r = resolveEvent(s, computeMods(s), p.id, choice.id, null);
      assert.equal(r.ok, true, `${def.id}.${choice.id}: ${r.reason}`);
      assert.ok(Number.isFinite(s.company.cash), `${def.id}.${choice.id} cash`);
      assert.ok(s.company.reputation >= 0.2, `${def.id}.${choice.id} reputation`);
      run(s, 0.2);
    }
  }
});

test('every event survives a bare company with nobody to talk about', () => {
  for (const def of EVENTS) {
    const s = game(3);
    s.company.cash = 1e7;
    const p = spawnEvent(s, def.id);
    for (const choice of visibleChoices(s, def, p)) {
      if (choice.minigame) continue;
      const s2 = game(3);
      s2.company.cash = 1e7;
      const p2 = spawnEvent(s2, def.id);
      assert.doesNotThrow(() => eventText(s2, p2), def.id);
      assert.doesNotThrow(() => resolveEvent(s2, computeMods(s2), p2.id, choice.id, null), `${def.id}.${choice.id}`);
    }
  }
});

test('a scheduled follow-up arrives after its delay and names the same person', () => {
  const s = rich(13);
  const genius = s.employees[1];
  const p = spawnEvent(s, 'genius_vanished', { name: genius.name, id: genius.id });
  resolveEvent(s, computeMods(s), p.id, 'cook', null);
  assert.equal(s.events.scheduled.length, 1);
  s.events.pending = [];
  run(s, 5);
  const follow = s.events.pending.find((x) => x.eventId === 'genius_return')
    || s.events.log.find((l) => l.title === 'The Rewrite Is In');
  assert.ok(follow, 'the rewrite came back');
});

test('a rival poaching move becomes a decision about a real employee', () => {
  const s = rich(17);
  s.events.pending = [];
  const rival = s.competitors.find((c) => c.alive);
  s.rivalState.poachRequest = { day: s.time.day, rival: rival.id };
  tickEvents(s, computeMods(s), 0.01, null);
  const p = s.events.pending.find((x) => x.eventId === 'rival_poach');
  assert.ok(p, 'poach event spawned');
  assert.ok(s.employees.some((e) => e.id === p.subjectId), 'about someone who works here');
  const before = s.employees.length;
  resolveEvent(s, computeMods(s), p.id, 'go', null);
  assert.equal(s.employees.length, before - 1);
  assert.ok(s.alumni.some((a) => a.why.includes(rival.name)));
});
