#!/usr/bin/env node
import { PROFILES, run, CHECKPOINTS, DAYS_PER_REAL_HOUR, report, hrs } from './balance_lib.js';
import { money, abbrev } from '../src/sim/util.js';

function main() {
  const seeds = [11, 202, 3003];
  const horizonHours = Number(process.env.HOURS || 90);
  const horizon = DAYS_PER_REAL_HOUR * horizonHours;
  const summary = [];

  for (const profileName of Object.keys(PROFILES)) {
    console.log(`\n${'='.repeat(104)}\n${PROFILES[profileName].label}\n${'='.repeat(104)}`);
    for (const seed of seeds) {
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

  console.log('\nAssumptions: 1 game day = 2 real minutes. Offline time is credited identically to');
  console.log('online time up to the 16-hour cap, so a multi-day horizon assumes the player returns');
  console.log('at least once every 16 hours. The scripted operator is deliberately competent but not');
  console.log('optimal: it hires on need, reinvests ~28% of revenue in marketing, takes funding only');
  console.log('when runway is short or the round is large, and never micro-optimises project order.');
}

main();
