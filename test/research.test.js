import test from 'node:test';
import assert from 'node:assert/strict';
import { game, mods, launch, run } from './helpers.js';
import { researchStatus, startResearch, researchSlots } from '../src/sim/research.js';
import { computeMods } from '../src/sim/modifiers.js';
import { RESEARCH, researchById } from '../src/data/research.js';
import { STAGES, stageOrder } from '../src/data/stages.js';

/** A company at `stage` with money and a shipped product. */
function atStage(stage, seed = 90) {
  const s = game(seed);
  launch(s);
  run(s, 5);
  s.company.stage = stage;
  s.company.cash = 5e8;
  return s;
}

const statusAt = (stage, id, prep) => {
  const s = atStage(stage);
  prep?.(s);
  return researchStatus(s, computeMods(s), id).state;
};

test('research unlocked at Seed stays available at every later stage', () => {
  // Regression: stage unlocks were read from the current stage only, so the
  // `research` flag vanished the moment the company grew past Seed.
  for (const stage of ['seed', 'growing', 'scaleup', 'major', 'late']) {
    assert.equal(statusAt(stage, 'ci_cd'), 'available', `ci_cd at ${stage}`);
  }
});

test('research is still gated before the Seed stage', () => {
  for (const stage of ['solo', 'tiny']) {
    assert.equal(statusAt(stage, 'ci_cd'), 'locked', `ci_cd should be locked at ${stage}`);
  }
});

test('every stage keeps the unlock flags of the stages below it', () => {
  const s = atStage('late');
  const flags = computeMods(s).flags;
  for (const stage of STAGES) for (const u of stage.unlocks) assert.ok(flags.has(u), `late stage lost ${u}`);
});

test('a stage-gated research item unlocks at its stage and stays unlocked after', () => {
  const gated = RESEARCH.filter((r) => r.stage);
  assert.ok(gated.length, 'fixture: some research is stage gated');
  for (const r of gated) {
    const done = r.req;                                  // satisfy prerequisites
    const before = STAGES.filter((st) => st.order < stageOrder(r.stage));
    for (const st of before) {
      assert.equal(statusAt(st.id, r.id, (s) => { s.research.completed.push(...done); }), 'locked',
        `${r.id} must stay locked at ${st.id}`);
    }
    for (const st of STAGES.filter((x) => x.order >= stageOrder(r.stage))) {
      assert.equal(statusAt(st.id, r.id, (s) => { s.research.completed.push(...done); }), 'available',
        `${r.id} should be available at ${st.id}`);
    }
  }
});

test('prerequisite research is still required', () => {
  assert.equal(statusAt('growing', 'code_review'), 'locked');
  assert.equal(statusAt('growing', 'code_review', (s) => s.research.completed.push('ci_cd')), 'available');
});

test('completed research never becomes purchasable again', () => {
  const s = atStage('scaleup');
  s.research.completed.push('ci_cd');
  const m = computeMods(s);
  assert.equal(researchStatus(s, m, 'ci_cd').state, 'done');
  const cash = s.company.cash;
  assert.equal(startResearch(s, m, 'ci_cd').ok, false);
  assert.equal(s.company.cash, cash, 'a completed item must not be charged again');
});

test('affordability still gates research', () => {
  const s = atStage('growing');
  s.company.cash = 10;
  assert.equal(researchStatus(s, computeMods(s), 'ci_cd').state, 'unaffordable');
});

test('research slots still limit concurrent work', () => {
  const s = atStage('growing');
  const m = computeMods(s);
  assert.equal(startResearch(s, m, 'ci_cd').ok, true);
  const second = RESEARCH.find((r) => !r.req.length && !r.stage && r.id !== 'ci_cd');
  assert.equal(researchStatus(s, m, second.id).state, 'busy');
  assert.equal(researchSlots(s, m), 1);
});
