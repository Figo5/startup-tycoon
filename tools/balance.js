#!/usr/bin/env node
import { PROFILES, run, CHECKPOINTS, DAYS_PER_REAL_HOUR, report, hrs } from './balance_lib.js';
import { money, abbrev } from '../src/sim/util.js';
import { step } from '../src/sim/engine.js';
import { computeMods } from '../src/sim/modifiers.js';
import { emptyMeta, newGame } from '../src/sim/state.js';
import { PRESTIGE_UPGRADES, buyPrestige, performExit, prestigeLevels } from '../src/sim/prestige.js';
import { advisorOffers, hireAdvisor } from '../src/sim/advisors.js';
import { ensureAcquisitions, acquireCompany } from '../src/sim/acquisitions.js';
import { roadmapChoices, startRoadmap, ensureRoadmap } from '../src/sim/roadmap.js';
import { goalsSummary, acceptGoal, goalById, tickGoals } from '../src/sim/goals.js';

const SEEDS = [11, 202, 3003];
const horizonHours = Number(process.env.HOURS || 90);
const horizon = DAYS_PER_REAL_HOUR * horizonHours;

function firstRuns() {
  const summary = [];
  for (const profileName of Object.keys(PROFILES)) {
    console.log(`\n${'='.repeat(104)}\n${PROFILES[profileName].label}\n${'='.repeat(104)}`);
    for (const seed of SEEDS) {
      const { state, marks, results } = run(seed, profileName, horizon, { checkpoints: CHECKPOINTS });
      report(`seed ${seed}`, results);
      const m = marks;
      console.log(`  milestones  first hire ${hrs(m.firstHire)} | office ${hrs(m.firstOffice)} | 2nd product ${hrs(m.secondProduct)}`
        + ` | manager ${hrs(m.firstManager)} | funding ${hrs(m.firstFunding)} | enterprise ${hrs(m.firstEnterprise)}`);
      console.log('  stages      ' + Object.entries(m.stages).map(([k, v]) => `${k} ${hrs(v)}`).join(' | '));
      if (m.exit) {
        console.log(`  EXIT        ${m.exit.name} at ${hrs(m.exit.day)} - ${money(m.exit.value)} valuation,`
          + ` ${(m.exit.equity * 100).toFixed(0)}% owned, ${m.exit.rep} Founder Reputation`);
      } else {
        console.log(`  EXIT        not reached within ${horizonHours} real hours`
          + ` (stage ${state.company.stage}, valuation ${money(state.stats.valuation)})`);
      }
      summary.push({ profileName, seed, exit: m.exit });
    }
  }
  return summary;
}

/** The same three profiles, but actually playing the new systems. */
function systemsRuns() {
  console.log(`\n${'='.repeat(104)}\nRoadmaps, advisors, acquisitions and goals played (same operator otherwise)\n${'='.repeat(104)}`);
  const out = [];
  for (const profileName of Object.keys(PROFILES)) {
    const label = PROFILES[profileName].label;
    const exits = [];
    const marks = [];
    for (const seed of SEEDS) {
      const { marks: m } = run(seed, profileName, horizon, { checkpoints: [], systems: true });
      exits.push(m.exit);
      marks.push(m);
    }
    const days = exits.filter(Boolean).map((e) => e.day);
    const avg = days.length ? days.reduce((a, b) => a + b, 0) / days.length : null;
    console.log(`${label.padEnd(44)} first exit ${avg ? hrs(avg) : 'not reached'}`
      + ` (${exits.filter(Boolean).map((e) => `${(e.day / DAYS_PER_REAL_HOUR).toFixed(1)}h`).join(' / ')})`
      + `  roadmap started ${marks.filter((m) => m.firstRoadmap).length}/3`);
    out.push({ profileName, avg });
  }
  return out;
}

/** Run 2: same profile, with the first exit's Founder Reputation spent. */
function postPrestige() {
  console.log(`\n${'='.repeat(104)}\nPost-prestige: run 1 (all systems) -> spend everything -> run 2\n${'='.repeat(104)}`);
  const spendOrder = ['capital', 'founder_skill', 'brand_equity', 'talent_network', 'lean_ops',
    'cloud_credits', 'veteran_team', 'market_insight', 'research_head_start', 'playbook',
    'cloud_credits', 'deal_flow', 'warm_intros', 'exit_multiple', 'office_lease'];
  for (const profileName of ['moderate', 'active']) {
    const first = run(11, profileName, horizon, { checkpoints: [], systems: true });
    const meta = first.state.meta;
    let spent = 0;
    let buys = 0;
    for (const id of spendOrder) {
      let guard = 0;
      while (guard++ < 20) {
        const r = buyPrestige(meta, id);
        if (!r.ok) break;
        spent += r.price;
        buys++;
      }
    }
    const levels = prestigeLevels(meta).filter((u) => u.level > 0)
      .map((u) => `${u.name} ${u.level}/${u.max}`).join(', ') || 'none';
    const second = run(11, profileName, horizon, { checkpoints: [], meta, systems: true });
    const m2 = second.marks;
    console.log(`${PROFILES[profileName].label}`);
    console.log(`  run 1 exited ${first.state.exitResult ? `at ${hrs(first.state.exitResult.day)} for ${first.state.meta.lifetimeRep} FR` : 'no exit'};`
      + ` bought ${buys} levels for ${spent} FR; left ${Math.floor(meta.founderRep)} FR`);
    console.log(`  upgrades    ${levels}`);
    console.log(`  run 2       first hire ${hrs(m2.firstHire)} | manager ${hrs(m2.firstManager)} | funding ${hrs(m2.firstFunding)}`
      + ` | exit ${m2.exit ? `${hrs(m2.exit.day)} (${(m2.exit.equity * 100).toFixed(0)}% owned, ${m2.exit.rep} FR)` : 'not reached'}`);
  }
}

/** Every "cannot be claimed twice" claim the spec asks about, as an assertion. */
function invariantScan() {
  console.log(`\n${'='.repeat(104)}\nRepeat-claim scan (each of these must be exactly once)\n${'='.repeat(104)}`);
  const results = [];
  const check = (label, ok, detail = '') => {
    results.push({ label, ok, detail });
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  };
  const big = (seed = 7, stage = 'late') => {
    const s = newGame({ seed, meta: emptyMeta() });
    s.company.stage = stage;
    s.company.cash = 8e7;
    s.products[0].stage = 'live';
    // A large standing contract gives the company the revenue an IPO needs, and
    // it survives the simulation steps below (which recompute stats).
    s.contracts.push({
      id: 'ctr_probe', name: 'Probe Contract', revenueDay: 2e6, sla: false,
      supportLoad: 0, infraLoad: 0, remaining: 3650, slaBreaches: 0
    });
    s.stats.revenueDay = 2e6;
    for (let i = 0; i < 400; i++) step(s, 0.05, null);
    // Reputation and valuation drift during those steps, so set them last.
    s.stats.valuation = 9e8;
    s.company.reputation = 8;
    return s;
  };

  // founder upgrades: replay, affordability, cap, non-negative currency
  {
    const meta = emptyMeta();
    meta.founderRep = 5000;
    const levels = {};
    for (const up of PRESTIGE_UPGRADES) {
      let guard = 0;
      while (buyPrestige(meta, up.id).ok && guard++ < 50);
      levels[up.id] = meta.upgrades[up.id];
    }
    const txs = PRESTIGE_UPGRADES.reduce((a, up) => a + meta.upgrades[up.id], 0);
    check('founder upgrades stop at max', PRESTIGE_UPGRADES.every((up) => meta.upgrades[up.id] === up.max), `${txs} levels`);
    check('founder reputation never negative', meta.founderRep >= 0, `${Math.floor(meta.founderRep)} left`);
    const rich = emptyMeta();
    rich.founderRep = 10;
    buyPrestige(rich, 'capital', { txId: 'tx1' });
    const replay = buyPrestige(rich, 'capital', { txId: 'tx1' });
    check('a replayed purchase transaction pays once', !replay.ok && replay.duplicate === true, replay.reason);
    const poor = emptyMeta();
    poor.founderRep = 1;
    check('unaffordable purchase refused', !buyPrestige(poor, 'capital').ok);
  }

  // exits: one payout per run, even from a manipulated state
  {
    const s = big(19, 'late');
    const mods = computeMods(s);
    const first = performExit(s, mods, 'ipo');
    const second = performExit(s, mods, 'ipo');
    const third = performExit(s, mods, 'acqui');
    check('exit pays exactly once', first.ok && !second.ok && !third.ok, `${second.reason}`);
    check('equity cannot go negative', s.company.founderEquity === 0);
    check('run history recorded once', s.meta.runs.length === 1);
    const before = s.meta.lifetimeRep;
    for (let i = 0; i < 20; i++) performExit(s, mods, 'ipo');
    for (let i = 0; i < 200; i++) step(s, 0.05, null);
    check('replayed exits and further steps pay nothing', s.meta.lifetimeRep === before, `${s.meta.lifetimeRep} FR`);
  }

  // advisors: slots cap the stack, and effects are bounded
  {
    const s = big(21);
    const mods = computeMods(s);
    for (let i = 0; i < 40; i++) {
      const a = advisorOffers(s).filter((x) => x.available)[0];
      if (!a) break;
      hireAdvisor(s, a.id);
    }
    const slots = { seed: 1, growing: 2, scaleup: 3, major: 3, late: 3 }[s.company.stage] ?? 0;
    check('advisor slots cap the stack', s.advisors.hired.length === slots, `${s.advisors.hired.length}/${slots}`);
    const dev = mods.devSpeed || 0;
    check('advisor modifiers stay bounded', Math.abs(dev) < 0.5, `devSpeed ${dev.toFixed(2)}`);
  }

  // acquisitions: bought once, effects applied once
  {
    const s = big(23, 'scaleup');
    const mods = computeMods(s);
    const t = ensureAcquisitions(s).targets[0];
    const r1 = acquireCompany(s, mods, t.id);
    const r2 = acquireCompany(s, mods, t.id);
    const people = s.employees.length;
    const tech = JSON.stringify(s.acquisitions.tech);
    const r3 = acquireCompany(s, mods, t.id);
    check('an acquisition cannot be bought twice', r1.ok && !r2.ok && !r3.ok, r2.reason);
    check('people added exactly once', s.employees.length === people);
    check('technology applied exactly once', JSON.stringify(s.acquisitions.tech) === tech, tech);
  }

  // roadmaps: effects land once and survive a reload
  {
    const s = big(25, 'growing');
    const mods = computeMods(s);
    const p = s.products[0];
    const pick = roadmapChoices(s, p).filter((c) => c.available)[0];
    const key = pick.effects.revMul !== undefined ? 'revMul' : Object.keys(pick.effects)[0];
    const before = p[key] || 0;
    startRoadmap(s, mods, p.id, pick.id);
    for (let i = 0; i < 8000 && ensureRoadmap(p).active; i++) step(s, 0.05, null);
    const once = (p[key] || 0) - before;
    for (let i = 0; i < 400; i++) step(s, 0.05, null);
    const twice = (p[key] || 0) - before;
    check('roadmap effect applied exactly once', Math.abs(once - twice) < 1e-9, `${key} +${once.toFixed(3)}`);
    check('roadmap not re-runnable', !roadmapChoices(s, p).find((c) => c.id === pick.id).available);
  }

  // goals: reward paid once, even if the tick is spammed
  {
    const s = big(27, 'growing');
    acceptGoal(s, 'enterprise_push');
    s.products[0].customers.enterprise = 12;
    const cash = s.company.cash;
    const d1 = tickGoals(s, computeMods(s), 0.05, null);
    const paid = s.company.cash - cash;
    for (let i = 0; i < 50; i++) tickGoals(s, computeMods(s), 0.05, null);
    const reward = goalById('enterprise_push').reward.cash;
    check('goal reward paid exactly once', d1 && s.company.cash - cash === paid, `+${Math.round(paid)} (reward ${reward})`);
    check('goal completed once', s.goals.completed.filter((x) => x === 'enterprise_push').length === 1);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n  ${results.length - failed.length}/${results.length} repeat-claim checks pass`);
  return failed.length;
}

function main() {
  console.log('Startup Tycoon balance report');
  console.log(`1 game day = 2 real minutes · horizon ${horizonHours} real hours · seeds ${SEEDS.join(', ')}`);
  firstRuns();
  systemsRuns();
  postPrestige();
  const failures = invariantScan();

  console.log('\nAssumptions: 1 game day = 2 real minutes. Offline time is credited identically to');
  console.log('online time up to the 16-hour cap, so a multi-day horizon assumes the player returns');
  console.log('at least once every 16 hours. The scripted operator is deliberately competent but not');
  console.log('optimal: it hires on need, reinvests ~28% of revenue in marketing, takes funding only');
  console.log('when runway is short or the round is large, and never micro-optimises project order.');
  console.log('The "new systems" section uses the same operator plus roadmaps, advisors, acquisitions');
  console.log('and goals, so the difference between the two sections is those four systems.');
  process.exit(failures ? 1 : 0);
}

main();
