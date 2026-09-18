// Advisors: slot limits, fees charged once, effects that really reach the sim,
// and a stated prestige reset.
import test from 'node:test';
import assert from 'node:assert/strict';
import { game, mods, run, launch } from './helpers.js';
import { step } from '../src/sim/engine.js';
import { computeMods } from '../src/sim/modifiers.js';
import {
  advisorOffers, hireAdvisor, dismissAdvisor, advisorSlots, advisorRetainerDay,
  advisorMods, ensureAdvisors, hiredAdvisorIds, isHired, advisorsUnlocked
} from '../src/sim/advisors.js';
import { ADVISORS, advisorById, ADVISOR_SLOTS } from '../src/data/advisors.js';
import { computeWorkforce } from '../src/sim/workforce.js';
import { performExit, startNextRun } from '../src/sim/prestige.js';
import { serialize, hydrate } from '../src/sim/save.js';
import { tickEconomy } from '../src/sim/economy.js';

function richCompany(seed = 121, stage = 'growing') {
  const s = game(seed);
  launch(s);
  run(s, 1);
  s.company.stage = stage;
  s.company.cash = 2e7;
  s.stats.revenueDay = 20000;
  return s;
}

test('every advisor declares a real cost and effects the modifier system reads', () => {
  const READ_KEYS = new Set(['devSpeed', 'debtRate', 'payroll', 'infraCost', 'capacityPerUnit',
    'reliability', 'revenue', 'marketSize', 'conversion', 'enterpriseConv', 'contractSize', 'sales',
    'marketing', 'support', 'churn', 'researchSpeed', 'outageRisk', 'staffChurn', 'hireQuality',
    'candidateRefresh', 'candidateSlots', 'projectQuality', 'fundingValuation', 'valuation',
    'reputationGain', 'managerBonus', 'deptBonus', 'moraleGain', 'deskBonus', 'capacity']);
  for (const a of ADVISORS) {
    assert.ok(a.name && a.archetype && a.blurb, `${a.id} has an identity`);
    assert.ok(a.fee > 0, `${a.id} charges an engagement fee`);
    assert.ok(a.retainerRev > 0, `${a.id} charges a retainer`);
    assert.ok(a.tradeoff && a.tradeoff.length > 10, `${a.id} states its downside`);
    assert.ok(Object.keys(a.effects).length > 0, `${a.id} does something`);
    for (const k of Object.keys(a.effects)) assert.ok(READ_KEYS.has(k), `${a.id}: ${k} is read by the sim`);
    assert.ok(ADVISOR_SLOTS[a.unlock] >= 1, `${a.id} unlocks at a stage with slots`);
  }
  assert.ok(ADVISORS.length >= 8 && ADVISORS.length <= 12, `${ADVISORS.length} archetypes`);
  assert.equal(advisorById('nobody'), null);
});

test('advisors are locked until the Seed stage, and slots are stage-based', () => {
  const solo = game(122);
  assert.equal(advisorsUnlocked(solo), false);
  assert.equal(advisorSlots(solo), 0);
  assert.equal(hireAdvisor(solo, 'growth_hacker').ok, false);
  assert.equal(advisorOffers(solo)[0].available, false);
  const seed = richCompany(123, 'seed');
  assert.equal(advisorSlots(seed), 1);
  const scaleup = richCompany(124, 'scaleup');
  assert.equal(advisorSlots(scaleup), 3);
  assert.equal(advisorSlots(richCompany(125, 'late')), 3);
});

test('retaining an advisor charges the fee once and refuses a second time', () => {
  const s = richCompany(126);
  const offer = advisorOffers(s).find((a) => a.available);
  const cash = s.company.cash;
  const first = hireAdvisor(s, offer.id);
  assert.ok(first.ok);
  assert.equal(s.company.cash, cash - offer.fee, 'the listed fee, once');
  const second = hireAdvisor(s, offer.id);
  assert.equal(second.ok, false);
  assert.equal(s.company.cash, cash - offer.fee, 'the refused hire cost nothing');
  assert.equal(ensureAdvisors(s).hired.length, 1);
  assert.equal(isHired(s, offer.id), true);
  assert.deepEqual(hiredAdvisorIds(s), [offer.id]);
});

test('the slot cap is enforced from authoritative state, not from the rendered list', () => {
  const s = richCompany(127);
  const offers = advisorOffers(s).filter((a) => a.available);
  assert.ok(offers.length > 3);
  assert.ok(hireAdvisor(s, offers[0].id).ok);
  assert.ok(hireAdvisor(s, offers[1].id).ok);
  assert.equal(advisorSlots(s), 2, 'Growing Startup has two slots');
  const third = hireAdvisor(s, offers[2].id);
  assert.equal(third.ok, false);
  assert.match(third.reason, /slot/i);
  assert.equal(ensureAdvisors(s).hired.length, 2);
  // Dismissing frees a slot; rehiring charges the fee again.
  const dismissed = dismissAdvisor(s, offers[0].id);
  assert.ok(dismissed.ok);
  assert.equal(dismissed.refund, 0, 'nothing is refunded');
  const cash = s.company.cash;
  assert.ok(hireAdvisor(s, offers[2].id).ok);
  assert.equal(s.company.cash, cash - offers[2].fee);
});

test('an advisor effect reaches the simulation, and so does their downside', () => {
  const s = richCompany(128);
  const before = computeMods(s);
  const cloud = advisorOffers(s).find((a) => a.id === 'cloud_architect');
  assert.ok(hireAdvisor(s, cloud.id).ok);
  const after = computeMods(s);
  assert.ok((after.infraCost || 0) < (before.infraCost || 0), 'infrastructure gets cheaper');
  assert.ok((after.reliability || 0) > (before.reliability || 0), 'reliability improves');
  assert.ok((after.revenue || 0) < (before.revenue || 0), 'and revenue per customer pays for it');
  // The retainer is real money: it shows up as its own line in the economy tick.
  const wf = computeWorkforce(s, after);
  const revBefore = s.stats.revenueDay;
  tickEconomy(s, after, wf, 5000, 0, 1, null);
  assert.equal(s.stats.advisorDay, Math.max(10, Math.round(revBefore * cloud.retainerRev)));
  assert.ok(s.stats.expenseDay >= s.stats.advisorDay, 'the retainer is part of the daily burn');
  assert.ok(advisorRetainerDay(s) > 0);
});

test('advisor modifiers are bounded and do not stack past the slots', () => {
  const s = richCompany(129, 'scaleup');
  for (let i = 0; i < 30; i++) {
    const a = advisorOffers(s).filter((x) => x.available)[0];
    if (!a) break;
    hireAdvisor(s, a.id);
  }
  assert.equal(ensureAdvisors(s).hired.length, 3);
  const bag = advisorMods(s);
  for (const [k, v] of Object.entries(bag)) {
    assert.ok(Math.abs(v) < 1, `${k} delta ${v} stays small`);
  }
  const m = computeMods(s);
  for (const k of ['devSpeed', 'infraCost', 'payroll', 'marketSize', 'conversion', 'churn']) {
    assert.ok(Math.abs(m[k] || 0) < 0.5, `${k} ${(m[k] || 0).toFixed(3)} bounded`);
  }
});

test('advisors persist through a save and through a reload', () => {
  const s = richCompany(130);
  const offer = advisorOffers(s).find((a) => a.available);
  hireAdvisor(s, offer.id);
  const restored = hydrate(serialize(s));
  assert.ok(restored.ok);
  assert.deepEqual(hiredAdvisorIds(restored.state), [offer.id]);
  assert.equal(advisorMods(restored.state)[Object.keys(offer.effects)[0]],
    advisorMods(s)[Object.keys(offer.effects)[0]]);
});

test('prestige resets the advisory bench (a stated design decision)', () => {
  const s = richCompany(131, 'late');
  hireAdvisor(s, advisorOffers(s).find((a) => a.available).id);
  assert.equal(ensureAdvisors(s).hired.length, 1);
  const r = performExit(s, mods(s), 'acqui');
  assert.ok(r.ok);
  const next = startNextRun(r.meta, { seed: 5 });
  assert.equal(ensureAdvisors(next).hired.length, 0, 'a new company starts with an empty bench');
  assert.equal(advisorSlots(next), 0, 'and no advisor access before Seed');
});

test('a malformed hired list is repaired instead of breaking everything downstream', () => {
  // A hand-edited, imported or older save can hold bare ids, junk entries or
  // nothing at all. Everything downstream reads `hired[i].id`, so loading has to
  // normalise it rather than trust it.
  const s = game(311);
  s.advisors = { hired: ['growth_hacker', null, {}, { id: 'not_a_real_advisor' }, { id: 'veteran_cto' }], slots: 9 };
  const fixed = ensureAdvisors(s);
  assert.deepEqual(hiredAdvisorIds(s), ['growth_hacker', 'veteran_cto'], 'kept the real ones, in order');
  assert.ok(fixed.hired.every((h) => h && typeof h.id === 'string'));
  assert.equal(fixed.hired[0].day, 0, 'a coerced entry still has a shape the UI can read');
  for (const id of hiredAdvisorIds(s)) assert.ok(advisorById(id), `${id} exists`);
  // And the repaired state still works: effects compute, no throw.
  assert.doesNotThrow(() => computeMods(s));
  assert.deepEqual(Object.keys(advisorMods(s)).length > 0, true);
});

test('junk hired data cannot leak into the office or the modifier bag', () => {
  const s = game(312);
  s.advisors = { hired: [{ id: 'ghost_advisor' }], slots: 2 };
  ensureAdvisors(s);
  assert.deepEqual(hiredAdvisorIds(s), [], 'an unknown advisor is dropped');
  assert.deepEqual(advisorMods(s), {}, 'and contributes no effects');
  assert.equal(advisorRetainerDay(s), 0, 'and no retainer');
});
