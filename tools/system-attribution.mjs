// How much does each new system move first-exit time? Uses the balance
// operator with the new systems switched on one at a time, so the cost of a
// feature is measured rather than asserted. Run: node tools/system-attribution.mjs
import { run, DAYS_PER_REAL_HOUR } from './balance_lib.js';

const HOURS = Number(process.env.HOURS || 16);
const horizon = HOURS * DAYS_PER_REAL_HOUR;
const SEEDS = [11, 202, 3003];
const CONFIGS = [
  ['nothing (baseline)', { skip: ['roadmap', 'advisor', 'acquisition', 'goal'] }],
  ['roadmap only', { skip: ['advisor', 'acquisition', 'goal'] }],
  ['advisor only', { skip: ['roadmap', 'acquisition', 'goal'] }],
  ['acquisition only', { skip: ['roadmap', 'advisor', 'goal'] }],
  ['goal only', { skip: ['roadmap', 'advisor', 'acquisition'] }],
  ['all four', { skip: [] }]
];

console.log(`first exit, hours of real play (${SEEDS.length} seeds averaged per profile)\n`);
for (const [label, cfg] of CONFIGS) {
  const cells = [];
  for (const profileName of ['idle', 'moderate', 'active']) {
    const days = [];
    for (const seed of SEEDS) {
      const { marks } = run(seed, profileName, horizon, { checkpoints: [], systems: true, ...cfg });
      days.push(marks.exit ? marks.exit.day / DAYS_PER_REAL_HOUR : NaN);
    }
    const ok = days.filter((d) => Number.isFinite(d));
    cells.push(`${profileName} ${ok.length ? (ok.reduce((a, b) => a + b, 0) / ok.length).toFixed(2) : '--'}h`);
  }
  console.log(`${label.padEnd(20)} ${cells.join(' | ')}`);
}
