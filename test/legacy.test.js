import test from 'node:test';
import assert from 'node:assert/strict';
import { game, run, launch } from './helpers.js';
import { computeMods } from '../src/sim/modifiers.js';
import { newGame, emptyMeta, normalizeMeta, makeCandidate } from '../src/sim/state.js';
import { fundingOffers } from '../src/sim/funding.js';
import { officeOptions } from '../src/sim/office.js';
import { canHire, hire } from '../src/sim/workforce.js';
import { performExit, exitPreview, buyPrestige, startNextRun } from '../src/sim/prestige.js';
import { backgroundOptions, startCategoriesFor, tickAchievements, challengesUnlocked } from '../src/sim/legacy.js';
import { step } from '../src/sim/engine.js';

function late(seed = 81, opts = {}) {
  const s = game(seed, opts);
  launch(s);
  run(s, 3);
  s.company.stage = 'late';
  s.stats.revenueDay = 2e6;
  s.stats.valuation = 8e9;
  s.company.reputation = 8;
  return s;
}

test('a fresh founder chooses from sidegrade backgrounds; the rest are earned', () => {
  const meta = normalizeMeta(emptyMeta());
  const open = backgroundOptions(meta).filter((b) => b.unlocked).map((b) => b.id);
  assert.deepEqual(open, ['generalist', 'technical', 'seller', 'designer']);
  assert.equal(challengesUnlocked(meta), false);
  assert.deepEqual(startCategoriesFor(meta), ['mobile', 'saas', 'services']);
  meta.runs.push({ company: 'x' });
  meta.achievements.push('went_public');
  const now = backgroundOptions(meta).filter((b) => b.unlocked).map((b) => b.id);
  assert.ok(now.includes('serial') && now.includes('veteran_ceo'));
  assert.ok(startCategoriesFor(meta).includes('games'));
  assert.equal(challengesUnlocked(meta), true);
});

test('a background changes the modifiers the simulation reads', () => {
  const tech = newGame({ seed: 3, background: 'technical' });
  const gen = newGame({ seed: 3 });
  assert.ok((computeMods(tech).devSpeed || 0) > (computeMods(gen).devSpeed || 0));
  assert.ok((computeMods(tech).sales || 0) < (computeMods(gen).sales || 0));
});

test('challenges are enforced where they bite', () => {
  const s = newGame({ seed: 4, challenges: ['bootstrap', 'small_team', 'lean_office', 'no_marketing'] });
  s.company.stage = 'major';
  s.stats.revenueDay = 1e6;
  assert.ok(fundingOffers(s, computeMods(s)).every((o) => !o.available), 'no equity rounds');
  s.company.cash = 1e9;
  const tiers = officeOptions(s);
  s.office.tier = 'loft';
  assert.equal(officeOptions(s).find((t) => t.id === 'floor').available, false, 'capped at the loft');
  s.office.deskCapacity = 99;
  for (let i = 0; i < 30; i++) s.employees.push({ ...s.employees[0], id: `x${i}`, name: `X${i}`, role: 'engineer', salary: 1 });
  assert.equal(canHire(s, computeMods(s)), false, 'team capped at 25');
  s.company.marketingBudget = 5000;
  step(s, 0.1, null);
  assert.equal(s.company.marketingBudget, 0, 'marketing stays at zero');
  void tiers;
});

test('challenges pay more Founder Reputation on exit', () => {
  const plain = late(90);
  const hard = late(90, { challenges: ['hard_rivals', 'lean_office'] });
  const a = exitPreview(plain, computeMods(plain)).find((e) => e.id === 'ipo');
  const b = exitPreview(hard, computeMods(hard)).find((e) => e.id === 'ipo');
  assert.ok(b.rep > a.rep, `${b.rep} > ${a.rep}`);
});

test('early exits have their own doors and pay a stage bonus', () => {
  const s = game(12);
  launch(s);
  run(s, 2);
  s.company.stage = 'growing';
  s.stats.valuation = 5e7;
  const opts = exitPreview(s, computeMods(s));
  const ah = opts.find((e) => e.id === 'acquihire');
  assert.equal(ah.available, true);
  assert.ok(ah.rep >= 1, 'an early exit still pays something');
  assert.equal(opts.find((e) => e.id === 'ipo').available, false);
  assert.equal(opts.find((e) => e.id === 'pe').available, false, 'PE needs a profitable scale-up');
  const r = performExit(s, computeMods(s), 'acquihire');
  assert.ok(r.ok, r.reason);
  assert.ok(s.meta.achievements.includes('acquihire'));
  assert.equal(performExit(s, computeMods(s), 'acquihire').ok, false, 'once only');
});

test('achievements pay exactly once, ever', () => {
  const s = game(13);
  launch(s);
  tickAchievements(s, null);
  const n = s.meta.achievements.length;
  const fr = s.meta.founderRep;
  for (let i = 0; i < 5; i++) tickAchievements(s, null);
  assert.equal(s.meta.achievements.length, n);
  assert.equal(s.meta.founderRep, fr);
  assert.ok(s.meta.achievements.includes('shipped'));
});

test('the hall of fame remembers the best people and a co-founder carries over', () => {
  const s = late(95);
  const c = makeCandidate(s.rng, 'senior_engineer', { hiredDay: 1 });
  c.traits = ['tenx'];
  c.skill = 11;
  s.candidates.push(c);
  s.office.deskCapacity = 50;
  s.company.cash = 1e7;
  assert.ok(hire(s, c.id, computeMods(s)).ok);
  const { meta } = performExit(s, computeMods(s), 'ipo');
  assert.ok(meta.hallOfFame.some((h) => h.name === c.name && h.traits.includes('tenx')));
  meta.founderRep = 100;
  assert.ok(buyPrestige(meta, 'cofounder').ok);
  const next = startNextRun(meta, { seed: 7, companyName: 'Two', cofounder: c.name });
  const co = next.employees.find((e) => e.name === c.name);
  assert.ok(co, 'the co-founder joined on day one');
  assert.ok(co.traits.includes('tenx'));
  assert.ok(co.skill < c.skill, 'a little rusty');
});

test('start options reach the new company', () => {
  const s = newGame({ seed: 8, startCategory: 'services', background: 'seller', challenges: ['recession_start'] });
  assert.equal(s.products[0].category, 'services');
  assert.equal(s.background, 'seller');
  assert.equal(s.market.economy, 'recession');
  const bad = newGame({ seed: 8, startCategory: 'nope', background: 'nope', challenges: ['nope'] });
  assert.equal(bad.products[0].category, 'mobile');
  assert.equal(bad.background, 'generalist');
  assert.deepEqual(bad.challenges, []);
});
