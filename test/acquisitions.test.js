// Acquisitions: affordable, once each, and every consequence lands exactly once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { game, mods, run, launch } from './helpers.js';
import { step } from '../src/sim/engine.js';
import { computeMods } from '../src/sim/modifiers.js';
import {
  ensureAcquisitions, acquisitionOffers, acquireCompany, refreshAcquisitionTargets,
  acquiredRevenue, acquiredInfraLoad, acquiredSupportLoad, acquisitionTech,
  integrationActive, offersAllowed, targetPrice, targetById
} from '../src/sim/acquisitions.js';
import { ACQUISITION_POOL, OFFERS_BY_STAGE } from '../src/data/acquisitions.js';
import { computeLoad, effectiveCapacity } from '../src/sim/infra.js';
import { supportCoverage } from '../src/sim/products.js';
import { computeWorkforce } from '../src/sim/workforce.js';
import { tickEconomy } from '../src/sim/economy.js';
import { serialize, hydrate } from '../src/sim/save.js';

function scaleCompany(seed = 141, stage = 'scaleup') {
  const s = game(seed);
  launch(s);
  run(s, 1);
  s.company.stage = stage;
  // Scale-Up economics: hundreds of millions in the bank, a nine-figure business.
  s.company.cash = 3e8;
  s.stats.revenueDay = 400000;
  s.stats.valuation = 1.2e9;
  refreshAcquisitionTargets(s);
  return s;
}

/** The cheapest affordable offer, which is what a player would be looking at. */
function firstAffordable(s) {
  const offer = acquisitionOffers(s).filter((t) => t.available).sort((a, b) => a.price - b.price)[0];
  assert.ok(offer, 'at least one company is affordable and for sale');
  return offer;
}

test('every target has the fields an acquisition decision needs', () => {
  for (const t of ACQUISITION_POOL) {
    assert.ok(t.name && t.category && t.blurb, `${t.id} has an identity`);
    assert.ok(t.priceShare > 0 && t.floor > 0, `${t.id} has a price`);
    assert.ok(Number.isFinite(t.users) && t.users >= 0, `${t.id} states users`);
    assert.ok(t.revenueShare > 0, `${t.id} contributes revenue`);
    assert.ok(Array.isArray(t.employees) && t.employees.length, `${t.id} brings people`);
    assert.ok(t.integrationDays > 0, `${t.id} has an integration period`);
    assert.ok(t.moraleHit > 0, `${t.id} disrupts morale`);
    assert.ok(t.techNote, `${t.id} explains its technology benefit`);
    assert.ok(t.sellerReason, `${t.id} explains why it is for sale`);
    assert.ok(Object.keys(t.tech).length > 0, `${t.id} has technology effects`);
  }
  assert.equal(targetById('nobody'), null);
});

test('offers open at Scale-Up, are capped per stage, and never repeat', () => {
  const early = game(142);
  assert.equal(offersAllowed(early), 0);
  assert.equal(ensureAcquisitions(early).targets.length, 0);
  const big = scaleCompany(143);
  assert.equal(ensureAcquisitions(big).targets.length, OFFERS_BY_STAGE.scaleup);
  const ids = ensureAcquisitions(big).targets.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate offers');
  // Refreshing must not keep adding more than the allowance.
  refreshAcquisitionTargets(big);
  refreshAcquisitionTargets(big);
  assert.equal(ensureAcquisitions(big).targets.length, OFFERS_BY_STAGE.scaleup);
});

test('an acquisition cannot be bought twice, and never reappears', () => {
  const s = scaleCompany(144);
  const m = mods(s);
  const offer = firstAffordable(s);
  const cash = s.company.cash;
  const first = acquireCompany(s, m, offer.id);
  assert.ok(first.ok, first.reason || '');
  assert.equal(s.company.cash, cash - first.price, 'the asking price, once');
  const second = acquireCompany(s, m, offer.id);
  const third = acquireCompany(s, m, offer.id);
  assert.equal(second.ok, false);
  assert.equal(third.ok, false);
  assert.equal(s.company.cash, cash - first.price, 'nothing is paid again');
  assert.equal(ensureAcquisitions(s).completed.filter((c) => c.id === offer.id).length, 1);
  assert.equal(ensureAcquisitions(s).targets.some((t) => t.id === offer.id), false);
  assert.equal(acquisitionOffers(s).some((t) => t.id === offer.id), false);
});

test('an unaffordable target is refused with nothing changed', () => {
  const s = scaleCompany(145);
  const offer = acquisitionOffers(s)[0];
  s.company.cash = offer.price - 1;
  const staff = s.employees.length;
  const r = acquireCompany(s, mods(s), offer.id);
  assert.equal(r.ok, false);
  assert.equal(s.employees.length, staff, 'nobody joined');
  assert.equal(ensureAcquisitions(s).completed.length, 0);
  assert.equal(acquiredRevenue(s), 0);
  assert.equal(acquisitionOffers(s).find((t) => t.id === offer.id).available, false);
});

test('people, revenue, load and technology all land exactly once', () => {
  const s = scaleCompany(146);
  const m = mods(s);
  const def = ACQUISITION_POOL.find((t) => t.id === 'forgekit');
  // Offer the devtools startup directly so the test is deterministic.
  ensureAcquisitions(s).targets = [{ id: def.id, price: 1e6, day: s.time.day, expires: false }];
  const staff = s.employees.length;
  const expected = def.employees.reduce((a, [, n]) => a + n, 0);
  const techBefore = acquisitionTech(s);
  const r = acquireCompany(s, m, def.id);
  assert.ok(r.ok);
  assert.equal(r.hires, expected, 'the stated number of people joined');
  assert.equal(s.employees.length, staff + expected, 'added once, at purchase time');
  assert.ok(acquiredRevenue(s) > 0);
  assert.ok(acquiredInfraLoad(s) > 0);
  assert.ok(acquiredSupportLoad(s) > 0);
  const tech = acquisitionTech(s);
  assert.ok(tech.devSpeed > (techBefore.devSpeed || 0), 'technology benefit applied');
  // Re-running the engine must not add any of it again. Headcount may fall
  // (people resign) but it must never *grow* again from the same purchase.
  for (let i = 0; i < 100; i++) step(s, 0.05, null);
  assert.ok(s.employees.length <= staff + expected, 'nobody joined twice');
  assert.equal(s.acquisitions.assets.length, 1);
  assert.equal(s.acquisitions.completed.length, 1);
  assert.deepEqual(acquisitionTech(s), tech);
});

test('the integration period is a real, temporary cost', () => {
  const s = scaleCompany(147);
  const m = mods(s);
  const offer = firstAffordable(s);
  const before = computeMods(s).devSpeed || 0;
  const moraleBefore = s.employees.map((e) => e.morale);
  const r = acquireCompany(s, m, offer.id);
  assert.ok(r.ok);
  assert.equal(integrationActive(s), true);
  assert.ok((computeMods(s).devSpeed || 0) < before, 'engineering slows during integration');
  assert.ok(s.employees.some((e) => e.morale < (moraleBefore[0] ?? 1)), 'morale takes a hit');
  assert.ok(s.acquisitions.integrationUntil > s.time.day);
  // The drag is temporary: it expires with the integration window.
  const days = s.acquisitions.integrationUntil - s.time.day;
  for (let i = 0; i < Math.ceil(days / 0.05) + 40; i++) step(s, 0.05, null);
  assert.equal(integrationActive(s), false);
  assert.ok((computeMods(s).devSpeed || 0) >= before, 'the permanent benefit outlives the drag');
});

test('acquired load and revenue feed the infrastructure and support models', () => {
  const s = scaleCompany(148);
  const m = mods(s);
  const loadBefore = computeLoad(s);
  const offer = firstAffordable(s);
  // A standing contract puts support demand clearly above the floor, so the
  // coverage calculation is actually exercised rather than short-circuited.
  s.contracts.push({
    id: 'ctr_probe', name: 'Probe Contract', revenueDay: 50000, sla: false,
    supportLoad: 4, infraLoad: 0, remaining: 365, slaBreaches: 0
  });
  const withoutAcquired = { ...s, acquisitions: { ...s.acquisitions, assets: [] } };
  const coverageBefore = supportCoverage(s, m, computeWorkforce(s, m));
  const coverageWithout = supportCoverage(withoutAcquired, m, computeWorkforce(withoutAcquired, m));
  assert.ok(coverageBefore <= coverageWithout, 'acquired accounts add queue pressure');

  acquireCompany(s, m, offer.id);
  assert.ok(computeLoad(s) > loadBefore, 'capacity has to grow');
  assert.ok(computeLoad(s) > computeLoad(withoutAcquired), 'the acquired load is counted');
  // The acquired revenue is part of the top line, not a separate pot.
  tickEconomy(s, m, computeWorkforce(s, m), 1000, 0, 1, null);
  assert.equal(s.stats.acquiredDay, acquiredRevenue(s));
  assert.ok(s.stats.revenueDay >= s.stats.acquiredDay, 'acquired revenue lands in the top line');
  assert.ok(effectiveCapacity(s, computeMods(s)) > 0);
});

test('acquisitions survive a save and reload without duplicating anything', () => {
  const s = scaleCompany(149);
  const offer = acquisitionOffers(s).find((t) => t.available);
  const r = acquireCompany(s, mods(s), offer.id);
  assert.ok(r.ok);
  const restored = hydrate(serialize(s));
  assert.ok(restored.ok);
  const a = ensureAcquisitions(restored.state);
  assert.equal(a.completed.length, 1);
  assert.equal(a.completed[0].id, offer.id);
  assert.deepEqual(acquisitionTech(restored.state), acquisitionTech(s));
  assert.equal(acquiredRevenue(restored.state), acquiredRevenue(s));
  assert.equal(acquireCompany(restored.state, computeMods(restored.state), offer.id).ok, false);
});

test('acquisitions are priced off the valuation, with a floor', () => {
  const def = targetById('chartly');
  const small = { stats: { valuation: 0 } };
  assert.equal(targetPrice(small, def), def.floor, 'a floor protects early buyers');
  const large = { stats: { valuation: 1e10 } };
  assert.equal(targetPrice(large, def), Math.round(1e10 * def.priceShare));
  assert.ok(targetPrice(large, def) > targetPrice(small, def));
});

test('a run that has ended cannot buy a company', () => {
  const s = scaleCompany(150, 'late');
  const offer = firstAffordable(s);
  s.exitResult = { id: 'ipo', name: 'IPO', day: s.time.day, value: 1, equity: 1, proceeds: 1, rep: 1, achievements: [] };
  const r = acquireCompany(s, mods(s), offer.id);
  assert.equal(r.ok, false);
  assert.match(r.reason, /ended/i);
  assert.equal(acquisitionOffers(s).find((t) => t.id === offer.id).available, false);
});
