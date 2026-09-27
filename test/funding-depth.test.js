import test from 'node:test';
import assert from 'node:assert/strict';
import { game, run, launch } from './helpers.js';
import { computeMods } from '../src/sim/modifiers.js';
import { fundingOffers, raise, tickFunding, loanOffer, takeLoan, exitOptions } from '../src/sim/funding.js';

function funded(stage = 'growing') {
  const s = game(21);
  launch(s);
  run(s, 5);
  s.company.stage = stage;
  s.stats.revenueDay = 5000;
  return s;
}

test('each round offers several term sheets with different shapes', () => {
  const s = funded('growing');
  const a = fundingOffers(s, computeMods(s)).find((o) => o.id === 'series_a');
  const ids = a.terms.map((t) => t.investor);
  assert.deepEqual(ids, ['lead', 'small', 'tier1', 'strategic']);
  const lead = a.terms.find((t) => t.investor === 'lead');
  const small = a.terms.find((t) => t.investor === 'small');
  const tier1 = a.terms.find((t) => t.investor === 'tier1');
  assert.ok(small.equity < lead.equity && small.cash < lead.cash, 'a small round sells less');
  assert.ok(tier1.valuation > lead.valuation && tier1.target, 'top-tier pays more, with strings');
  const angel = fundingOffers(s, computeMods(s)).find((o) => o.id === 'angel');
  assert.equal(angel.terms.some((t) => t.investor === 'strategic'), false, 'no strategic money at angel stage');
});

test('the default raise is the old single-offer behaviour', () => {
  const s = funded('growing');
  const before = s.company.founderEquity;
  const r = raise(s, computeMods(s), 'angel');
  assert.equal(r.ok, true);
  assert.ok(Math.abs(s.company.founderEquity - before * (1 - 0.12)) < 1e-9);
});

test('a top-tier target is scored once: hit rewards, a miss punishes', () => {
  const hit = funded();
  raise(hit, computeMods(hit), 'angel', 'tier1');
  const t = hit.funding.targets[0];
  assert.ok(t && t.status === 'open');
  hit.stats.revenueDay = t.goal + 1;
  tickFunding(hit, 0.1, null);
  assert.equal(t.status, 'hit');
  const rep = hit.company.reputation;
  tickFunding(hit, 0.1, null);
  assert.equal(hit.company.reputation, rep, 'scored only once');

  const miss = funded();
  raise(miss, computeMods(miss), 'angel', 'tier1');
  const m = miss.funding.targets[0];
  miss.time.day = m.deadline + 1;
  const repBefore = miss.company.reputation;
  tickFunding(miss, 0.1, null);
  assert.equal(m.status, 'missed');
  assert.ok(miss.company.reputation < repBefore);
  assert.ok(miss.boosts.some((b) => b.id === 'board_pressure'));
});

test('a strategic investor changes exit values and adds a permanent perk', () => {
  const s = funded('growing');
  s.stats.valuation = 1e9;
  const before = exitOptions(s, computeMods(s));
  raise(s, computeMods(s), 'series_a', 'strategic');
  const mods = computeMods(s);
  assert.ok(mods.contractSize >= 0.08, 'perk merged into modifiers');
  const after = exitOptions(s, mods);
  const val = (list, id) => list.find((e) => e.id === id).value;
  assert.ok(val(after, 'strategic') > val(before, 'strategic'));
  assert.ok(val(after, 'ipo') < val(before, 'ipo'));
});

test('a revenue loan is paid back out of revenue and never twice at once', () => {
  const s = funded('tiny');
  s.stats.revenueDay = 1000;
  const offer = loanOffer(s);
  assert.equal(offer.available, true);
  const cash = s.company.cash;
  const r = takeLoan(s);
  assert.equal(r.ok, true);
  assert.equal(s.company.cash, cash + offer.principal);
  assert.equal(takeLoan(s).ok, false, 'one loan at a time');
  run(s, 30);
  assert.ok(s.funding.loans.length === 0 || s.funding.loans[0].owed < offer.repay, 'repayment is happening');
});
