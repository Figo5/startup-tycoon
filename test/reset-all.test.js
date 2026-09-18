// Full reset: starting completely over must land on exactly the state a
// first-ever player sees, with no trace of the old run or old founder meta left
// anywhere a later load could pick it up.
import test from 'node:test';
import assert from 'node:assert/strict';

// A minimal localStorage, installed before the save layer is imported so its
// storage calls run for real rather than being skipped.
class FakeStorage {
  constructor() { this.map = new Map(); }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}
globalThis.localStorage = new FakeStorage();

const { SAVE_KEY, CORRUPT_KEY, TAB_KEY, PREF_PREFIX, save, load, serialize, resetAllProgress, progressKeys } =
  await import('../src/sim/save.js');
const { newGame, SAVE_VERSION } = await import('../src/sim/state.js');
const { PRESTIGE_UPGRADES } = await import('../src/data/prestige.js');
const { runOffline } = await import('../src/sim/engine.js');

const ls = globalThis.localStorage;

/** A save that looks like the exploit happened: maxed founder, developed company. */
function exploitedState() {
  const s = newGame({ seed: 4242, companyName: 'Exploit Test Inc.' });
  s.meta.founderRep = 99;                 // unspent reputation
  s.meta.lifetimeRep = 140;               // everything ever earned
  s.meta.upgrades = Object.fromEntries(PRESTIGE_UPGRADES.map((u) => [u.id, u.max]));
  s.meta.runs = [
    { company: 'Old Co', exit: 'IPO', value: 1e9, proceeds: 3e8, rep: 14, days: 61, stage: 'major' },
    { company: 'Shady Co', exit: 'IPO', value: 2e9, proceeds: 4e8, rep: 16, days: 40, stage: 'scaleup' }
  ];
  s.meta.unlockedScenarios = ['standard', 'downturn'];
  s.meta.achievements = ['first_exit', 'unicorn'];
  s.meta.appliedTx = ['tx_old_1', 'tx_old_2'];

  s.company.name = 'Exploit Test Inc.';
  s.company.stage = 'scaleup';
  s.company.cash = 5_000_000;
  s.company.founderEquity = 0.31;
  s.company.ownership = { soldTotal: 0.69, transactions: [{ id: 'ownership_old', pct: 0.69, source: 'funding' }] };
  s.company.totalRaised = 40_000_000;
  s.company.reputation = 4.5;
  s.office.tier = 'campus';
  s.office.rooms = ['meeting', 'exec', 'lab'];
  s.office.deskCapacity = 40;
  s.products.push(newGame({ seed: 9 }).products[0]);
  s.employees.push(newGame({ seed: 11 }).employees[0]);
  s.infra = { capacity: 900, load: 700, reliability: 0.97, autoscale: true, spendDay: 12, outageTimer: 0 };
  s.research = { completed: ['ci_cd', 'content', 'helpcenter', 'analytics'], active: [], points: 120 };
  s.funding = { rounds: [{ id: 'seed', raised: 2e6, pct: 0.1 }], offers: [{ id: 'oa' }], exitOffers: [{ id: 'x' }] };
  s.events = { pending: [{ id: 'e1' }], cooldown: 1, log: [{ id: 'e0' }], seen: { e1: 2 }, lastEventId: 'e1', recentCats: ['money'] };
  s.advisors = { hired: ['growth_hacker'], slots: 2 };
  s.goals = { offered: ['growth_push'], active: { id: 'growth_push', startedDay: 3 }, completed: ['seed_round'], offeredDay: 3 };
  s.acquisitions = { targets: [{ id: 'forgekit' }], completed: ['forgekit'], integrationUntil: 40, assets: ['devtools'] };
  s.exitResult = { name: 'IPO', value: 1e9, equity: 0.31, proceeds: 3e8, rep: 14, day: 61, achievements: [] };
  s.products[0].roadmap = { active: { id: 'free_tier', done: 10, work: 40 }, history: [{ id: 'referral', day: 20 }], auto: true };
  return s;
}

/** Seeds storage with a dirty save plus every key that could carry progress. */
function dirtyStorage() {
  ls.clear();
  const s = exploitedState();
  ls.setItem(SAVE_KEY, JSON.stringify(serialize(s)));
  ls.setItem(CORRUPT_KEY, '{"version":4,"state":{}}');
  ls.setItem(TAB_KEY, JSON.stringify({ id: 'other-tab', at: Date.now() }));
  ls.setItem('startup-tycoon/save/v0', JSON.stringify(serialize(s)));   // a legacy key
  ls.setItem(`${PREF_PREFIX}ui`, JSON.stringify({ reducedMotion: true })); // a preference
  ls.setItem('unrelated-app/key', 'keep me');
  return s;
}

const paths = (o, prefix = '', out = []) => {
  if (Array.isArray(o)) o.forEach((v, i) => paths(v, `${prefix}[${i}]`, out));
  else if (o && typeof o === 'object') for (const k of Object.keys(o)) paths(o[k], prefix ? `${prefix}.${k}` : k, out);
  else out.push(prefix);
  return out;
};
const scratch = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' && Number.isInteger(v) ? v : v)));

test('a full reset zeroes founder reputation and every upgrade level', () => {
  const before = dirtyStorage();
  assert.equal(before.meta.founderRep, 99);
  const { state } = resetAllProgress({ companyName: 'Fresh Co', seed: 1 });
  assert.equal(state.meta.founderRep, 0, 'unspent reputation');
  assert.equal(state.meta.lifetimeRep, 0, 'lifetime reputation');
  // normalizeMeta materialises every track at level 0, so "empty" means every
  // level is zero rather than an empty object.
  assert.deepEqual(Object.values(state.meta.upgrades).filter((v) => v !== 0), [], 'upgrade levels');
  assert.deepEqual(state.meta.runs, [], 'run history');
  assert.deepEqual(state.meta.unlockedScenarios, ['standard'], 'unlocks');
  assert.deepEqual(state.meta.achievements, []);
  assert.deepEqual(state.meta.appliedTx, []);
  for (const u of PRESTIGE_UPGRADES) {
    assert.equal(state.meta.upgrades[u.id] ?? 0, 0, `${u.id} level`);
  }
});

test('a full reset returns the company to a first-ever Solo Founder', () => {
  dirtyStorage();
  const { state } = resetAllProgress({ companyName: 'Fresh Co', seed: 2 });
  assert.equal(state.company.stage, 'solo');
  assert.equal(state.company.founderEquity, 1);
  assert.equal(state.company.ownership.soldTotal, 0);
  assert.deepEqual(state.company.ownership.transactions, []);
  assert.equal(state.company.cash, 15000, 'starter cash');
  assert.equal(state.company.totalRaised, 0);
  assert.equal(state.exitResult, null, 'no exit state left');
  assert.equal(state.office.tier, 'garage');
  assert.deepEqual(state.office.rooms, []);
  assert.equal(state.employees.length, 1);
  assert.equal(state.employees[0].id, 'founder');
  assert.equal(state.products.length, 1);
  assert.equal(state.products[0].stage !== undefined, true);
  assert.deepEqual(state.research.completed, []);
  assert.deepEqual(state.funding.rounds, []);
  assert.deepEqual(state.funding.offers, []);
  assert.deepEqual(state.infra.capacity, 12);
  assert.equal(state.infra.autoscale, false);
  assert.deepEqual(state.events.pending, []);
  assert.deepEqual(state.events.log, []);
  assert.deepEqual(state.advisors.hired, []);
  assert.equal(state.goals.active, null);
  assert.deepEqual(state.goals.completed, []);
  assert.deepEqual(state.acquisitions.completed, []);
  assert.deepEqual(state.acquisitions.assets, []);
  assert.deepEqual(state.products[0].roadmap.history, []);
  assert.equal(state.products[0].roadmap.active, null);
});

test('a full reset removes every progress key and leaves preferences alone', () => {
  dirtyStorage();
  const { removed } = resetAllProgress({ companyName: 'Fresh Co', seed: 3 });
  assert.ok(removed.includes(SAVE_KEY));
  assert.ok(removed.includes(CORRUPT_KEY), 'recovery copy');
  assert.ok(removed.includes(TAB_KEY), 'stale tab claim');
  assert.ok(removed.includes('startup-tycoon/save/v0'), 'legacy key');
  assert.equal(ls.getItem(CORRUPT_KEY), null);
  assert.equal(ls.getItem('startup-tycoon/save/v0'), null);
  assert.equal(ls.getItem(`${PREF_PREFIX}ui`), JSON.stringify({ reducedMotion: true }), 'preference kept');
  assert.equal(ls.getItem('unrelated-app/key'), 'keep me');
  // The clean state is persisted, and it is the only progress key left.
  assert.deepEqual(progressKeys(ls).sort(), [SAVE_KEY]);
});

test('reloading after a reset still shows a fresh game', () => {
  dirtyStorage();
  resetAllProgress({ companyName: 'Fresh Co', seed: 4 });
  const r = load();
  assert.equal(r.ok, true);
  assert.equal(r.state.version, SAVE_VERSION);
  assert.equal(r.state.meta.founderRep, 0);
  assert.equal(r.state.meta.lifetimeRep, 0);
  assert.equal(Object.values(r.state.meta.upgrades).filter((v) => v !== 0).length, 0);
  assert.deepEqual(r.state.meta.runs, []);
  assert.equal(r.state.company.stage, 'solo');
  assert.equal(r.state.company.founderEquity, 1);
  assert.equal(r.state.company.cash, 15000);
  assert.deepEqual(r.state.advisors.hired, []);
  assert.deepEqual(r.state.acquisitions.completed, []);
});

test('offline catch-up cannot bring deleted progress back', () => {
  dirtyStorage();
  const { state } = resetAllProgress({ companyName: 'Fresh Co', seed: 5 });
  assert.ok(Date.now() - state.time.lastRealMs < 1000, 'clock is fresh, so a boot credits nothing');
  // Even with a long absence, the credited progress is a brand-new company's:
  // no reputation, no upgrades, no run history, no equity already sold.
  state.time.lastRealMs -= 12 * 3600 * 1000;
  runOffline(state);
  assert.equal(state.meta.founderRep, 0);
  assert.equal(state.meta.lifetimeRep, 0);
  assert.equal(Object.values(state.meta.upgrades).filter((v) => v !== 0).length, 0);
  assert.deepEqual(state.meta.runs, []);
  assert.equal(state.company.founderEquity, 1);
  assert.equal(state.company.ownership.soldTotal, 0);
  assert.equal(state.exitResult, null);
});

test('resetting twice is safe and stays clean', () => {
  dirtyStorage();
  const first = resetAllProgress({ companyName: 'Fresh Co', seed: 6 });
  assert.ok(first.removed.length >= 4);
  const second = resetAllProgress({ companyName: 'Fresh Co', seed: 6 });
  assert.equal(second.state.meta.founderRep, 0);
  assert.equal(second.state.company.cash, 15000);
  assert.equal(Object.values(second.state.meta.upgrades).filter((v) => v !== 0).length, 0);
  assert.deepEqual(progressKeys(ls).sort(), [SAVE_KEY], 'no key accumulation');
  assert.equal(load().ok, true);
});

test('a reset matches the initial-state constructor field for field', () => {
  dirtyStorage();
  const { state } = resetAllProgress({ companyName: 'Untitled Inc.', seed: 77 });
  // Same seed and a reset id counter, so the only differences should be clocks.
  const expect = newGame({ companyName: 'Untitled Inc.', seed: 77 });
  // Ids carry a random suffix, so they can never be compared; everything else
  // must match exactly.
  const idLike = (v) => typeof v === 'string' && /^[a-z]+_[0-9a-z]+_[0-9a-z]+$/.test(v);
  const scrub = (v) => {
    if (Array.isArray(v)) return v.map(scrub);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, idLike(x) ? '<id>' : scrub(x)]));
    }
    return v;
  };
  const strip = (o) => {
    const c = scrub(structuredClone(o));
    delete c.time.lastRealMs;
    delete c.time.startedRealMs;
    return c;
  };
  // Key paths first: this is what catches a field a future new game would add
  // but a reset would forget to clear.
  assert.deepEqual(paths(strip(state)).sort(), paths(strip(expect)).sort(), 'same fields, same nesting');
  assert.deepEqual(strip(state), strip(expect), 'same fresh values');
});

test('the reset state survives a save/load round trip unchanged', () => {
  dirtyStorage();
  const { state } = resetAllProgress({ companyName: 'Fresh Co', seed: 8 });
  const blob = serialize(state);
  const r = load.call(null);
  assert.equal(r.ok, true);
  const before = JSON.stringify(scratch(state).meta);
  const after = JSON.stringify(scratch(r.state).meta);
  assert.equal(after, before, 'meta identical after a round trip');
  assert.equal(Object.values(r.state.meta.upgrades).filter((v) => v !== 0).length, 0);
});

test('the reset leaves a playable company: one product, MVP queued, cash positive', () => {
  dirtyStorage();
  const { state } = resetAllProgress({ companyName: 'Fresh Co', seed: 10 });
  assert.equal(state.products.length, 1);
  assert.equal(state.products[0].projects.length, 1);
  assert.equal(state.products[0].projects[0].name, 'Build MVP');
  assert.ok(state.company.cash > 0);
  assert.equal(state.time.paused, false);
  assert.equal(state.candidates.length > 0, true, 'a fresh hiring pool');
  save(state);
  assert.equal(load().ok, true);
});
