import test from 'node:test';
import assert from 'node:assert/strict';
import { game, mods, run, launch } from './helpers.js';
import { performExit, buyPrestige, startNextRun, exitPreview, canExit, prestigeLevels } from '../src/sim/prestige.js';
import { emptyMeta, metaEffects, newGame } from '../src/sim/state.js';
import { computeMods } from '../src/sim/modifiers.js';

function lateStage(seed = 51) {
  const s = game(seed);
  launch(s);
  run(s, 3);
  s.company.stage = 'late';
  s.stats.revenueDay = 2e6;
  s.stats.valuation = 8e9;
  s.company.reputation = 6;
  return s;
}

test('exits are gated until there is a buyer', () => {
  const s = game(50);
  assert.equal(canExit(s), false);
  assert.ok(exitPreview(s, mods(s)).every((e) => !e.available));
  s.flags.unlocked.push('exit_offer');
  s.stats.valuation = 1e8;
  assert.equal(canExit(s), true);
  assert.ok(exitPreview(s, mods(s)).some((e) => e.available));
});

test('an exit pays Founder Reputation scaled by the stake kept', () => {
  const bootstrapped = lateStage(51);
  const diluted = lateStage(51);
  diluted.company.founderEquity = 0.3;
  const a = exitPreview(bootstrapped, computeMods(bootstrapped)).find((e) => e.id === 'ipo');
  const b = exitPreview(diluted, computeMods(diluted)).find((e) => e.id === 'ipo');
  assert.ok(a.rep > b.rep, 'owning more of the company pays more');
  assert.ok(a.rep > 0);
});

test('performExit records the run and preserves meta progression', () => {
  const s = lateStage(52);
  const m = computeMods(s);
  const r = performExit(s, m, 'acqui');
  assert.ok(r.ok, r.reason);
  assert.equal(r.meta.runs.length, 1);
  assert.equal(r.meta.founderRep, r.summary.rep);
  assert.equal(r.meta.lifetimeRep, r.summary.rep);
  assert.ok(r.meta.achievements.includes('bootstrapped'));
  assert.ok(r.meta.unlockedScenarios.includes('crowded'), 'a finished run unlocks a harder market');
});

test('the next run resets the company but keeps founder progression', () => {
  const s = lateStage(53);
  const { meta } = performExit(s, computeMods(s), 'acqui');
  meta.founderRep = 50;
  assert.ok(buyPrestige(meta, 'capital').ok);
  assert.ok(buyPrestige(meta, 'capital').ok);
  assert.equal(meta.upgrades.capital, 2);

  const next = startNextRun(meta, { seed: 99, companyName: 'Second Try' });
  assert.equal(next.company.name, 'Second Try');
  assert.equal(next.company.stage, 'solo');
  assert.equal(next.products.length, 1);
  assert.equal(next.products[0].stage, 'development');
  assert.equal(next.employees.length, 1);
  assert.equal(next.company.founderEquity, 1);
  assert.equal(next.company.cash, 15000 + 2 * 25000, 'Seed Capital carries over');
  assert.equal(next.meta.runs.length, 1, 'run history survives');
  assert.equal(next.meta.founderRep, meta.founderRep);
});

test('prestige upgrades cost more each level and stop at their maximum', () => {
  const meta = emptyMeta();
  meta.founderRep = 1000;
  const first = prestigeLevels(meta).find((u) => u.id === 'capital');
  buyPrestige(meta, 'capital');
  const second = prestigeLevels(meta).find((u) => u.id === 'capital');
  assert.ok(second.price > first.price);
  for (let i = 0; i < 10; i++) buyPrestige(meta, 'capital');
  assert.equal(meta.upgrades.capital, 5);
  assert.equal(buyPrestige(meta, 'capital').ok, false);
});

test('meta effects feed the modifier system in a new run', () => {
  const meta = emptyMeta();
  meta.upgrades = { lean_ops: 3, market_insight: 2 };
  const fx = metaEffects(meta);
  assert.ok(Math.abs(fx.payroll + 0.12) < 1e-9);
  const s = newGame({ seed: 7, meta });
  const m = computeMods(s);
  assert.ok(Math.abs(m.marketSize - 0.24) < 1e-9);
});

test('harder scenarios apply their modifiers and pay more reputation', () => {
  const meta = emptyMeta();
  meta.runs = [{}, {}, {}];
  const s = newGame({ seed: 8, meta, scenarioId: 'downturn' });
  const m = computeMods(s);
  assert.ok(m.churn > 0, 'downturn raises churn');
  assert.ok(m.fundingValuation < 0, 'downturn lowers investor valuations');
});
