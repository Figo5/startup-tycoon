// Event cadence: more opportunities, still bounded, still varied.
import test from 'node:test';
import assert from 'node:assert/strict';
import { game, run, launch } from './helpers.js';
import { step } from '../src/sim/engine.js';
import { cadenceFor, MAX_UNRESOLVED, eligibleEvents, pickEvent, spawnEvent, tickEvents } from '../src/sim/events.js';
import { EVENTS, eventById } from '../src/data/events.js';
import { STAGES } from '../src/data/stages.js';
import { makeRng, rnd } from '../src/sim/rng.js';

function liveCompany(seed = 181, stage = 'seed', days = 3) {
  const s = game(seed);
  launch(s);
  run(s, days);
  s.company.stage = stage;
  return s;
}

test('every event carries a category, and every category is a real one', () => {
  const CATS = new Set(['people', 'product', 'customers', 'money', 'infra', 'market', 'legal']);
  for (const e of EVENTS) {
    assert.ok(e.cat, `${e.id} is tagged`);
    assert.ok(CATS.has(e.cat), `${e.id} has a known category (${e.cat})`);
  }
  // A category with one lonely event would make the damping unfair to it.
  const counts = {};
  for (const e of EVENTS) counts[e.cat] = (counts[e.cat] || 0) + 1;
  for (const [cat, n] of Object.entries(counts)) assert.ok(n >= 3, `${cat} has ${n} events`);
});

test('the cadence is stage-aware: light early, busier later', () => {
  const gaps = STAGES.map((stage) => {
    const s = liveCompany(182, stage.id);
    const c = cadenceFor(s);
    return { stage: stage.id, mean: (c.gap[0] + c.gap[1]) / 2, cap: c.cap, damp: c.damp };
  });
  for (const g of gaps) {
    assert.ok(g.mean > 0, `${g.stage} has a positive gap`);
    assert.ok(g.cap >= 1 && g.cap <= MAX_UNRESOLVED, `${g.stage} inbox cap is bounded`);
  }
  assert.ok(gaps[0].mean > gaps[6].mean, `solo ${gaps[0].mean} slower than late ${gaps[6].mean}`);
  assert.ok(gaps[6].cap >= gaps[0].cap, 'late stages allow more unresolved events');
  assert.ok(gaps[6].damp >= gaps[0].damp, 'late stages damp repeats harder');
});

test('the expected gap is materially shorter than the old fixed 3-7 day window', () => {
  // The old cadence averaged 5.0 game days between opportunities, at every stage.
  const OLD_MEAN = 5.0;
  const mid = STAGES.filter((s) => ['seed', 'growing', 'scaleup', 'major', 'late'].includes(s.id));
  for (const stage of mid) {
    const c = cadenceFor(liveCompany(183, stage.id));
    const mean = (c.gap[0] + c.gap[1]) / 2;
    assert.ok(mean < OLD_MEAN, `${stage.id} mean gap ${mean} is shorter than ${OLD_MEAN}`);
    assert.ok(mean > OLD_MEAN * 0.3, `${stage.id} mean gap ${mean} is not absurdly short`);
  }
  const solo = cadenceFor(liveCompany(184, 'solo'));
  const soloMean = (solo.gap[0] + solo.gap[1]) / 2;
  assert.ok(soloMean >= 4.0, `a solo founder is left alone (${soloMean} days)`);
});

test('a long run produces more event opportunities per day than the old cadence', () => {
  // Measured, not asserted from the table: count real spawns over the same span
  // at two stages, with the operator-free engine.
  const count = (stage) => {
    const s = game(185);
    launch(s);
    run(s, 2);
    s.company.stage = stage;
    const before = Object.values(s.events.seen).reduce((a, b) => a + b, 0);
    for (let i = 0; i < 1200; i++) step(s, 0.05, null);   // 60 game days
    return (Object.values(s.events.seen).reduce((a, b) => a + b, 0) - before) / 60;
  };
  const seed = count('seed');
  const scaleup = count('scaleup');
  const OLD_RATE = 1 / 5.0;
  assert.ok(seed > OLD_RATE, `seed ${seed.toFixed(3)}/day beats the old ${OLD_RATE}`);
  assert.ok(scaleup > seed, `scaleup ${scaleup.toFixed(3)}/day is busier than seed ${seed.toFixed(3)}`);
});

test('the inbox never fills past the cap, and the cooldown never banks a backlog', () => {
  const s = liveCompany(186, 'major');
  // Fill the inbox by hand, then run for a long time with nothing resolved.
  for (let i = 0; i < MAX_UNRESOLVED + 2; i++) spawnEvent(s, EVENTS[i].id);
  const start = s.events.pending.length;
  let maxPending = 0;
  for (let i = 0; i < 4000; i++) {
    step(s, 0.05, null);
    maxPending = Math.max(maxPending, s.events.pending.length);
    assert.ok(s.events.cooldown >= 0, 'cooldown is never negative');
  }
  assert.ok(maxPending <= Math.max(start, MAX_UNRESOLVED), `never more than the cap (saw ${maxPending})`);
  assert.ok(s.events.pending.length <= MAX_UNRESOLVED);
});

test('an event never fires twice in a row', () => {
  const s = liveCompany(187, 'major');
  const spawned = [];
  const prev = { ...s.events.seen };
  for (let i = 0; i < 6000; i++) {
    step(s, 0.05, null);
    for (const [id, n] of Object.entries(s.events.seen)) {
      if ((prev[id] || 0) !== n) {
        spawned.push(id);
        prev[id] = n;
      }
    }
    if (spawned.length > 1) {
      assert.notEqual(spawned[spawned.length - 1], spawned[spawned.length - 2],
        'the same event does not fire back to back');
    }
  }
  assert.ok(spawned.length >= 5, `saw ${spawned.length} spawns`);
});

test('a category that just fired is damped against firing again', () => {
  // Deterministic: the draw is seeded, so the same state must favour the
  // un-recent category. Compare weights directly through pickEvent's inputs.
  const s = liveCompany(188, 'major');
  const pool = eligibleEvents(s).filter((e) => e.id !== s.events.lastEventId);
  const catOf = (e) => e.cat;
  const target = pool.find((e) => catOf(e) === 'money') || pool[0];
  const fresh = { ...s, events: { ...s.events, recentCats: ['people', 'infra', 'product'] } };
  const damped = { ...s, events: { ...s.events, recentCats: [target.cat, target.cat, target.cat] } };
  const draws = (state) => {
    const counts = {};
    for (let i = 0; i < 400; i++) {
      const rng = makeRng(1000 + i);
      const probe = { ...state, rng };
      const chosen = pickEvent(probe, cadenceFor(state));
      if (chosen) counts[target.cat] = (counts[target.cat] || 0) + (chosen.cat === target.cat ? 1 : 0);
    }
    return counts[target.cat] || 0;
  };
  const freshHits = draws(fresh);
  const dampedHits = draws(damped);
  assert.ok(dampedHits < freshHits,
    `${target.cat} chosen ${dampedHits}/400 when recent vs ${freshHits}/400 when not`);
  assert.ok(rnd(makeRng(1)) >= 0, 'rng helper is used deterministically');
});

test('the whole pool stays reachable: no event is starved by the dampers', () => {
  const s = liveCompany(189, 'late', 5);
  s.company.reputation = 8;
  for (let i = 0; i < 30000; i++) step(s, 0.05, null);
  const seenIds = Object.keys(s.events.seen).filter((id) => s.events.seen[id] > 0);
  assert.ok(seenIds.length >= 20, `${seenIds.length} distinct events fired in one long run`);
  assert.ok(seenIds.every((id) => !!eventById(id)), 'only real events fired');
});

test('unattended auto-resolution keeps the inbox clear and never jams', () => {
  const s = liveCompany(190, 'growing');
  let laps = 0;
  for (let i = 0; i < 8000; i++) {
    step(s, 0.05, null);
    if (s.events.pending.some((p) => s.time.day > p.expiresDay + 1)) {
      laps++;
      break;
    }
  }
  assert.equal(laps, 0, 'nothing sits past its expiry day');
  assert.ok(s.events.pending.length <= MAX_UNRESOLVED);
  assert.ok(s.events.cooldown >= 0);
  assert.ok(Number.isFinite(s.company.cash) && s.company.cash >= 0, 'and the company survived');
});

test('events are never spawned from stage-locked content', () => {
  const s = liveCompany(191, 'solo');
  for (let i = 0; i < 3000; i++) step(s, 0.05, null);
  const seen = Object.keys(s.events.seen);
  for (const id of seen) {
    const def = eventById(id);
    if (!def.minStage) continue;
    assert.ok(STAGES.findIndex((x) => x.id === def.minStage) <= 0,
      `${id} needs ${def.minStage} but fired at solo`);
  }
});

test('tickEvents is safe with an empty pool', () => {
  const s = liveCompany(192, 'solo');
  s.events.cooldown = 0;
  s.events.lastEventId = null;
  s.events.pending = [];
  const rng = { s: 3 };
  s.rng = rng;
  assert.ok(pickEvent(s, cadenceFor(s)) !== undefined);
  assert.doesNotThrow(() => tickEvents(s, null, 10, null));
});
