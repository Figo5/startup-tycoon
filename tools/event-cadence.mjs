// Event cadence measurement. Drives full runs with the same scripted operator the
// balance tool uses and reports event opportunities per stage and per real hour.
// Run: node tools/event-cadence.mjs
//
// Stage attribution is measured, not inferred: the loop samples the company
// stage on every step and credits the events that fired to whatever stage was
// current. The run stops where the balance run stops (at the first exit).
import { newGame, emptyMeta } from '../src/sim/state.js';
import { step } from '../src/sim/engine.js';
import { operate, PROFILES, DAYS_PER_REAL_HOUR } from './balance_lib.js';
import { EVENTS } from '../src/data/events.js';

const SEEDS = [11, 202, 3003];
const PROFILES_TO_RUN = ['idle', 'moderate', 'active'];
const HORIZON_REAL_HOURS = Number(process.argv[2] || 16);
const HORIZON_DAYS = HORIZON_REAL_HOURS * DAYS_PER_REAL_HOUR;
const STEP = 0.05;

const STAGES = ['solo', 'tiny', 'seed', 'growing', 'scaleup', 'major', 'late'];
const spawnsByStage = Object.fromEntries(STAGES.map((s) => [s, 0]));
const daysByStage = Object.fromEntries(STAGES.map((s) => [s, 0]));
const cats = {};
let totalSpawns = 0;
let totalDays = 0;
let runs = 0;

const seenTotal = (state) => Object.values(state.events.seen).reduce((a, b) => a + b, 0);

for (const profileName of PROFILES_TO_RUN) {
  for (const seed of SEEDS) {
    const profile = PROFILES[profileName];
    const state = newGame({ seed, meta: emptyMeta() });
    const marks = { stages: {} };
    let nextCheck = 0;
    let prevSeen = 0;
    let prevDay = 0;
    for (let d = 0; d < HORIZON_DAYS; d += STEP) {
      step(state, STEP, null);
      if (state.time.day >= nextCheck) {
        operate(state, profile, marks);
        nextCheck = state.time.day + profile.checkEveryDays;
      }
      const stage = state.company.stage;
      const seen = seenTotal(state);
      daysByStage[stage] += state.time.day - prevDay;
      spawnsByStage[stage] += seen - prevSeen;
      totalDays += state.time.day - prevDay;
      prevSeen = seen;
      prevDay = state.time.day;
      if (marks.exit) break;
    }
    totalSpawns += seenTotal(state);
    for (const [id, n] of Object.entries(state.events.seen)) {
      const def = EVENTS.find((e) => e.id === id);
      cats[def?.cat || 'untagged'] = (cats[def?.cat || 'untagged'] || 0) + n;
    }
    runs++;
  }
}

const perRun = (n) => n / runs;
console.log(`horizon: first exit or ${HORIZON_REAL_HOURS} real hours · ${runs} runs (${SEEDS.length} seeds x ${PROFILES_TO_RUN.length} profiles)\n`);
console.log('events per stage');
console.log('  stage      runs-days   events   per game day   per real hour');
for (const s of STAGES) {
  const days = daysByStage[s];
  if (days < 0.05) continue;
  const perDay = spawnsByStage[s] / days;
  console.log(`  ${s.padEnd(10)} ${perRun(days).toFixed(1).padStart(8)} ${perRun(spawnsByStage[s]).toFixed(1).padStart(8)} ${perDay.toFixed(3).padStart(14)} ${(perDay * DAYS_PER_REAL_HOUR).toFixed(2).padStart(14)}`);
}
console.log(`\noverall: ${perRun(totalSpawns).toFixed(1)} events per run · ${(totalSpawns / totalDays).toFixed(3)} per game day · ${(totalSpawns / totalDays * DAYS_PER_REAL_HOUR).toFixed(2)} per real hour`);
console.log(`category mix: ${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
