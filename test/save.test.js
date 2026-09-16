import test from 'node:test';
import assert from 'node:assert/strict';
import { game, mods, run, launch } from './helpers.js';
import { serialize, validate, hydrate, migrate, exportSave, importSave } from '../src/sim/save.js';
import { SAVE_VERSION } from '../src/sim/state.js';
import { runOffline, step } from '../src/sim/engine.js';
import { REAL_SECONDS_PER_DAY, MAX_OFFLINE_DAYS } from '../src/sim/state.js';

test('a save round-trips exactly', () => {
  const s = game(31);
  launch(s);
  run(s, 25);
  const blob = JSON.parse(JSON.stringify(serialize(s)));
  const r = hydrate(blob);
  assert.ok(r.ok, r.reason);
  assert.equal(r.state.company.cash, s.company.cash);
  assert.equal(r.state.time.day, s.time.day);
  assert.equal(r.state.rng.s, s.rng.s, 'RNG state is preserved');
  assert.equal(r.state.products.length, s.products.length);
  assert.equal(r.state.meta.founderRep, s.meta.founderRep);
});

test('restored saves continue deterministically from the same RNG state', () => {
  const a = game(32);
  launch(a);
  run(a, 10);
  const b = hydrate(JSON.parse(JSON.stringify(serialize(a)))).state;
  run(a, 20);
  run(b, 20);
  assert.equal(Math.round(b.company.cash), Math.round(a.company.cash));
  assert.equal(b.rng.s, a.rng.s);
});

test('invalid saves are rejected rather than loaded', () => {
  assert.equal(validate(null).ok, false);
  assert.equal(validate({}).ok, false);
  assert.equal(validate({ version: 1 }).ok, false);
  assert.equal(validate({ version: SAVE_VERSION + 5, state: {} }).ok, false);
  const s = game(33);
  const blob = serialize(s);
  delete blob.state.company;
  assert.equal(validate(blob).ok, false);
  assert.equal(hydrate(blob).ok, false);
});

test('bad numbers in a save are caught', () => {
  const s = game(34);
  const blob = JSON.parse(JSON.stringify(serialize(s)));
  blob.state.company.cash = 'lots';
  assert.equal(validate(blob).ok, false);
  const blob2 = JSON.parse(JSON.stringify(serialize(s)));
  blob2.state.time.day = -5;
  assert.equal(validate(blob2).ok, false);
});

test('older saves migrate forward', () => {
  const s = game(35);
  const blob = JSON.parse(JSON.stringify(serialize(s)));
  blob.version = 1;
  delete blob.state.contracts;
  delete blob.state.boosts;
  const out = migrate(blob);
  assert.equal(out.version, SAVE_VERSION);
  assert.ok(Array.isArray(out.state.contracts));
});

test('export and import round-trip through text', () => {
  const s = game(36);
  run(s, 5);
  const text = exportSave(s);
  const r = importSave(text);
  assert.ok(r.ok, r.reason);
  assert.equal(Math.round(r.state.company.cash), Math.round(s.company.cash));
  assert.equal(importSave('not a save').ok, false);
});

test('offline progress advances the company once, and only once', () => {
  const s = game(37);
  launch(s);
  run(s, 5);
  const cash = s.company.cash;
  const day = s.time.day;

  s.time.lastRealMs = Date.now() - 2 * 3600 * 1000;      // two hours away
  const summary = runOffline(s);
  assert.ok(summary, 'a summary is returned');
  assert.ok(s.time.day > day, 'time advanced');
  assert.ok(Math.abs(summary.gameDays - (2 * 3600) / REAL_SECONDS_PER_DAY) < 0.01);

  const day2 = s.time.day;
  const again = runOffline(s);
  assert.equal(again, null, 'no reward for zero elapsed time');
  assert.equal(s.time.day, day2, 'the same elapsed time is never replayed');
});

test('offline progress is capped', () => {
  const s = game(38);
  launch(s);
  s.time.lastRealMs = Date.now() - 96 * 3600 * 1000;     // four days away
  const summary = runOffline(s);
  assert.ok(summary.capped);
  assert.ok(Math.abs(summary.gameDays - MAX_OFFLINE_DAYS) < 0.01);
});

test('a clock that moves backwards earns nothing', () => {
  const s = game(39);
  launch(s);
  run(s, 3);
  const day = s.time.day;
  const cash = s.company.cash;
  s.time.lastRealMs = Date.now() + 10 * 3600 * 1000;     // system clock jumped back
  const summary = runOffline(s);
  assert.equal(summary, null);
  assert.equal(s.time.day, day);
  assert.equal(s.company.cash, cash);
});

test('batched offline steps land close to fine-grained live steps', () => {
  const fine = game(40);
  const coarse = game(40);
  launch(fine); launch(coarse);
  for (let i = 0; i < 400; i++) step(fine, 0.0021, null);     // ~live tick size
  for (let i = 0; i < 17; i++) step(coarse, 0.05, null);      // offline chunk size
  const ratio = coarse.stats.users / Math.max(1, fine.stats.users);
  assert.ok(ratio > 0.8 && ratio < 1.25, `batching drift too large: ${ratio.toFixed(3)}`);
});
