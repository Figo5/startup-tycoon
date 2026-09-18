// Ad-hoc integration probe for the new systems. Not part of the test suite:
// it asserts real behaviour end to end across roadmap, advisors, acquisitions
// and goals, then prints what happened. Run: node tools/systems-probe.mjs
import { newGame } from '../src/sim/state.js';
import { step } from '../src/sim/engine.js';
import { computeMods } from '../src/sim/modifiers.js';
import { roadmapChoices, startRoadmap, ensureRoadmap, cancelRoadmap } from '../src/sim/roadmap.js';
import { advisorOffers, hireAdvisor, dismissAdvisor, advisorRetainerDay, advisorSlots } from '../src/sim/advisors.js';
import { ensureAcquisitions, acquireCompany, acquisitionOffers, acquiredRevenue } from '../src/sim/acquisitions.js';
import { goalsSummary, acceptGoal, abandonGoal, goalById, tickGoals } from '../src/sim/goals.js';
import { setCapacity, computeLoad } from '../src/sim/infra.js';
import { buyPrestige, performExit, startNextRun } from '../src/sim/prestige.js';
import { PANELS } from '../src/ui/panels.js';

const say = (...a) => console.log(...a);
let failures = 0;
const check = (label, cond, extra = '') => {
  if (!cond) { failures++; say(`  FAIL ${label} ${extra}`); } else say(`  ok   ${label} ${extra}`);
};

function bigGame(seed = 3) {
  const s = newGame({ seed });
  s.company.stage = 'scaleup';
  s.company.cash = 5e7;
  s.products[0].stage = 'live';
  s.stats.revenueDay = 90000;
  s.stats.valuation = 9e8;
  for (let i = 0; i < 900; i++) step(s, 0.05, null);
  return s;
}

say('panels render without undefined/NaN');
{
  const s = bigGame();
  const mods = computeMods(s);
  for (const name of Object.keys(PANELS)) {
    const html = PANELS[name]({ state: s, mods });
    check(`panel ${name}`, !!html && html.length > 40 && !/undefined|NaN|\[object/.test(html));
  }
}

say('\nroadmap: start once, progress, complete once');
{
  const s = bigGame();
  const mods = computeMods(s);
  const p = s.products[0];
  const open = roadmapChoices(s, p).filter((c) => c.available);
  check('choices offered', open.length > 0, open.map((c) => c.id).join(','));
  const cashBefore = s.company.cash;
  const r = startRoadmap(s, mods, p.id, open[0].id);
  check('start ok', r.ok);
  check('cost deducted exactly once', s.company.cash < cashBefore, `-${Math.round(cashBefore - s.company.cash)}`);
  const again = startRoadmap(s, mods, p.id, open[0].id);
  check('second start refused', !again.ok, again.reason);
  const before = { ...p, roadmap: undefined };
  for (let i = 0; i < 6000 && ensureRoadmap(p).active; i++) step(s, 0.05, null);
  check('completed', ensureRoadmap(p).history.includes(open[0].id), JSON.stringify(ensureRoadmap(p).history));
  const effects = roadmapChoices(s, p).find((c) => c.id === open[0].id).effects;
  for (const [k, v] of Object.entries(effects)) {
    const applied = k === 'techDebt' ? p.techDebt - (before.techDebt || 0) : (p[k] || 0) - (before[k] || 0);
    check(`effect ${k}`, Math.abs(applied - v) < 1e-9, `${applied}`);
  }
  check('not re-offerable', !roadmapChoices(s, p).find((c) => c.id === open[0].id).available);
}

say('\nroadmap cancel keeps the fee, clears the slot');
{
  const s = bigGame(9);
  const mods = computeMods(s);
  const p = s.products[0];
  const open = roadmapChoices(s, p).filter((c) => c.available)[0];
  startRoadmap(s, mods, p.id, open.id);
  const cash = s.company.cash;
  const c = cancelRoadmap(s, p.id);
  check('cancel ok', c.ok);
  check('no refund', Math.abs(s.company.cash - cash) < 1e-6);
  check('slot free again', roadmapChoices(s, p).filter((x) => x.available).length > 0);
}

say('\nadvisors: slots, fee, effects, retainer');
{
  const s = bigGame(11);
  const mods0 = computeMods(s);
  const slots = advisorSlots(s);
  const offers = advisorOffers(s).filter((a) => a.available);
  check('offers available', offers.length >= slots, `${offers.length} offers, ${slots} slots`);
  const first = offers.find((a) => a.id === 'cloud_architect') || offers[0];
  const cash = s.company.cash;
  const r = hireAdvisor(s, first.id);
  check('hire ok', r.ok, first.id);
  check('fee charged once', Math.abs((cash - s.company.cash) - first.fee) < 1e-6);
  check('double hire refused', !hireAdvisor(s, first.id).ok);
  const mods1 = computeMods(s);
  const moved = Object.keys(first.effects).some((k) => Math.abs((mods1[k] || 0) - (mods0[k] || 0)) > 1e-9);
  check('effects reach the modifier system', moved);
  check('retainer charged', advisorRetainerDay(s) > 0, `${Math.round(advisorRetainerDay(s))}/day`);
  // fill the remaining slots and prove the cap holds
  for (const a of advisorOffers(s).filter((x) => x.available).slice(0, 5)) hireAdvisor(s, a.id);
  check('slot cap enforced', s.advisors.hired.length <= slots, `${s.advisors.hired.length}/${slots}`);
  const over = advisorOffers(s).find((a) => !a.hired);
  if (over) check('over-cap hire refused', !hireAdvisor(s, over.id).ok, over.reason);
  check('dismiss works', dismissAdvisor(s, s.advisors.hired[0].id).ok);
}

say('\nacquisitions: affordability, once only, integration');
{
  const s = bigGame(12);
  const mods = computeMods(s);
  const targets = ensureAcquisitions(s).targets;
  check('targets offered', targets.length > 0, targets.map((t) => t.id).join(','));
  const t = targets[0];
  const staff0 = s.employees.length;
  const rev0 = acquiredRevenue(s);
  const r1 = acquireCompany(s, mods, t.id);
  check('purchase ok', r1.ok, r1.reason || '');
  const r2 = acquireCompany(s, mods, t.id);
  check('second purchase refused', !r2.ok, r2.reason);
  check('people added exactly once', s.employees.length === staff0 + r1.hires, `${staff0} -> ${s.employees.length}`);
  check('revenue added once', s.acquisitions.assets.length === 1 && acquiredRevenue(s) > rev0);
  check('never offered again', !ensureAcquisitions(s).targets.some((x) => x.id === t.id));
  check('integration window set', s.acquisitions.integrationUntil > s.time.day);
  const broke = bigGame(13);
  broke.company.cash = 0;
  const rb = acquireCompany(broke, computeMods(broke), ensureAcquisitions(broke).targets[0].id);
  check('unaffordable refused', !rb.ok, rb.reason);
  check('no free hire on refusal', broke.employees.length === bigGame(13).employees.length);
}

say('\ngoals: accept, progress, complete once');
{
  const s = bigGame(15);
  const g = goalsSummary(s);
  check('three offered', g.offered.length === 3, g.offered.map((x) => x.id).join(','));
  const pick = goalById('enterprise_push');
  check('accept ok', acceptGoal(s, pick.id).ok, pick.id);
  check('second accept refused', !acceptGoal(s, pick.id).ok);
  s.products[0].customers.enterprise = 9;
  const done = tickGoals(s, computeMods(s), 0.05, null);
  check('completed', !!done, done?.goal?.name);
  check('marked completed once', s.goals.completed.filter((x) => x === pick.id).length === 1);
  check('no active goal left', !s.goals.active);
  const again = tickGoals(s, computeMods(s), 0.05, null);
  check('no second completion', !again);
  check('not re-offered', !goalsSummary(s).offered.some((x) => x.id === pick.id));
  // a sustained goal needs consecutive days, not one good moment
  const sus = bigGame(16);
  acceptGoal(sus, 'reliability_leader');
  // Keep capacity right-sized, the way a player watching the company would: the
  // goal is about maintaining reliability, not about one lucky measurement.
  const keepSized = () => setCapacity(sus, Math.max(8, Math.ceil(computeLoad(sus) / 0.4)));
  for (let i = 0; i < 1200; i++) {
    keepSized();
    step(sus, 0.05, null);
    if (sus.goals.track > 0 || sus.goals.completed.includes('reliability_leader')) break;
  }
  check('a sustained goal accumulates while the condition holds',
    sus.goals.track > 0 || sus.goals.completed.includes('reliability_leader'),
    `track ${sus.goals.track.toFixed(1)} of 15, reliability ${sus.infra.reliability.toFixed(3)}, util ${sus.stats.loadRatio.toFixed(2)}`);
  for (let i = 0; i < 1200 && !sus.goals.completed.includes('reliability_leader'); i++) {
    keepSized();
    step(sus, 0.05, null);
  }
  check('a sustained goal is completable', sus.goals.completed.includes('reliability_leader'),
    `track ${sus.goals.track.toFixed(1)} of 15`);
  check('abandon works', abandonGoal({ ...s, goals: { ...s.goals, active: { id: 'growth_push' } } }).ok);
}

say('\nprestige: advisors reset, upgrades transactional');
{
  const s = bigGame(17);
  s.company.stage = 'late';
  hireAdvisor(s, advisorOffers(s).find((a) => a.available).id);
  acceptGoal(s, goalsSummary(s).offered[0].id);
  const mods = computeMods(s);
  const r = performExit(s, mods, 'acqui');
  check('exit ok', r.ok, r.reason || '');
  check('equity now zero', s.company.founderEquity === 0);
  check('run marked ended', !!s.exitResult);
  check('second exit refused', !performExit(s, mods, 'acqui').ok);
  const next = startNextRun(r.meta, { seed: 21, companyName: 'Second Co' });
  check('fresh run: equity 1', next.company.founderEquity === 1);
  check('fresh run: no advisors', next.advisors.hired.length === 0);
  check('fresh run: no goals kept', next.goals.completed.length === 0);
  check('fresh run: roadmap empty', !!next.products[0].roadmap && !next.products[0].roadmap.active);
  const meta = next.meta;
  meta.founderRep = 10;
  const b1 = buyPrestige(meta, 'capital', { txId: 'tx-a' });
  const b2 = buyPrestige(meta, 'capital', { txId: 'tx-a' });
  check('first buy ok', b1.ok, `level ${b1.level} for ${b1.price}`);
  check('replayed tx refused', !b2.ok && b2.duplicate, b2.reason);
  check('level moved once', meta.upgrades.capital === 1);
  check('reputation not negative', meta.founderRep >= 0, `${meta.founderRep}`);
}

say(`\n${failures ? `${failures} FAILURES` : 'all probes passed'}`);
process.exit(failures ? 1 : 0);
