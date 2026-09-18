// Browser test for the full reset. Loads a save that looks like the exploit
// happened, then drives RESET ALL PROGRESS through the real UI in Chromium and
// checks the game is genuinely back to a first-ever state - including after a
// reload.
//
//   node tools/playtest-reset.mjs
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { newGame } from '../src/sim/state.js';
import { serialize } from '../src/sim/save.js';
import { PRESTIGE_UPGRADES } from '../src/data/prestige.js';
import { ACQUISITION_POOL } from '../src/data/acquisitions.js';

const PW = process.env.PLAYWRIGHT_PATH || '/Users/giofiore/.hermes/hermes-agent/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);

const PORT = Number(process.env.PORT || 5203);
const URL = `http://localhost:${PORT}/`;
const SAVE_KEY = 'startup-tycoon/save/v1';
const CORRUPT_KEY = 'startup-tycoon/corrupt';
const TAB_KEY = 'startup-tycoon/tab';
const PREF_KEY = 'startup-tycoon/prefs/ui';
const LEGACY_KEY = 'startup-tycoon/save/v0';
mkdirSync('shots-reset', { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2600);

const problems = [];
let shotN = 0;
const say = (...a) => console.log(...a);
const check = (label, ok, detail = '') => {
  if (ok) say(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);
  else { problems.push(`${label}${detail ? ` — ${detail}` : ''}`); say(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message} @ ${(e.stack || '').split('\n').slice(1, 4).join(' | ')}`));

const shot = async (name) => {
  const file = `shots-reset/${String(++shotN).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file });
  return file;
};
const st = (fn) => page.evaluate(fn);
const boot = async () => {
  await page.waitForFunction(() => !!window.__startupTycoon, null, { timeout: 20000 });
  await page.waitForSelector('#game canvas');
  await sleep(900);
};
const closeOverlay = async () => {
  const b = page.locator('#overlay button[data-act="close-overlay"]');
  if (await b.count()) await b.first().click().catch(() => {});
  await sleep(250);
};
const openPanel = async (name) => {
  const current = await st(() => __startupTycoon.ui.openPanel);
  if (current !== name) await page.locator(`button[data-panel="${name}"]`).click();
  await sleep(320);
};

/** The exploit-shaped save: maxed founder meta and a developed company. */
function exploitedBlob() {
  const s = newGame({ seed: 4242, companyName: 'Exploit Test Inc.' });
  s.meta.founderRep = 99;
  s.meta.lifetimeRep = 140;
  s.meta.upgrades = Object.fromEntries(PRESTIGE_UPGRADES.map((u) => [u.id, u.max]));
  s.meta.runs = [
    { company: 'Old Co', exit: 'IPO', value: 1e9, proceeds: 3e8, rep: 14, days: 61, stage: 'major' },
    { company: 'Shady Co', exit: 'IPO', value: 2e9, proceeds: 4e8, rep: 16, days: 40, stage: 'scaleup' }
  ];
  s.meta.unlockedScenarios = ['standard', 'downturn'];
  s.company.name = 'Exploit Test Inc.';
  s.company.stage = 'scaleup';
  s.company.cash = 5_000_000;
  s.company.reputation = 4.5;
  s.company.founderEquity = 0.31;
  s.company.ownership = { soldTotal: 0.69, transactions: [{ id: 'ownership_old', pct: 0.69, source: 'funding' }] };
  s.company.totalRaised = 40_000_000;
  s.office.tier = 'campus';
  s.office.rooms = ['meeting', 'exec'];
  s.products[0].roadmap = { active: { id: 'free_tier', done: 10, work: 40 }, history: [{ id: 'referral', day: 20 }], auto: true };
  s.advisors = { hired: [{ id: 'growth_hacker', day: 2 }], slots: 2 };
  s.goals = { offered: ['growth_push'], active: { id: 'growth_push', startedDay: 3 }, completed: ['seed_round'], offeredDay: 3 };
  s.acquisitions = {
    targets: ACQUISITION_POOL.filter((t) => t.id === 'forgekit'),
    completed: ['forgekit'], integrationUntil: 40, assets: ['devtools'], tech: { devtools: 1 }
  };
  s.research = { completed: ['ci_cd', 'content'], active: [], points: 90 };
  s.funding = { rounds: [{ id: 'seed', raised: 2e6, pct: 0.1 }], offers: [], exitOffers: [] };
  return serialize(s);
}

say('full reset — browser verification\n');

// ---------------------------------------------------------------- dirty save
await page.goto(URL, { waitUntil: 'networkidle' });
await boot();
await st(() => { __startupTycoon.save = () => true; });   // do not let the page overwrite the injection
const blob = exploitedBlob();
await page.evaluate(([key, text]) => localStorage.setItem(key, text), [SAVE_KEY, JSON.stringify(blob)]);
await page.evaluate(([key, val]) => localStorage.setItem(key, val), [CORRUPT_KEY, '{"version":4,"state":{}}']);
await page.evaluate(([key, val]) => localStorage.setItem(key, val), [LEGACY_KEY, JSON.stringify(blob)]);
await page.evaluate(([key, val]) => localStorage.setItem(key, val), [PREF_KEY, JSON.stringify({ reducedMotion: true })]);
await page.reload({ waitUntil: 'networkidle' });
await boot();
await closeOverlay();   // the reload trips the single-tab notice

say('1. the exploit-shaped save is loaded');
const loaded = await st(() => ({
  rep: __startupTycoon.state.meta.founderRep,
  lifetime: __startupTycoon.state.meta.lifetimeRep,
  levels: Object.values(__startupTycoon.state.meta.upgrades).reduce((a, b) => a + b, 0),
  runs: __startupTycoon.state.meta.runs.length,
  stage: __startupTycoon.state.company.stage,
  cash: __startupTycoon.state.company.cash,
  equity: __startupTycoon.state.company.founderEquity,
  advisors: __startupTycoon.state.advisors.hired.length
}));
check('founder reputation is the exploited 99', loaded.rep === 99, String(loaded.rep));
check('every upgrade is maxed', loaded.levels === PRESTIGE_UPGRADES.reduce((a, u) => a + u.max, 0), String(loaded.levels));
check('run history present', loaded.runs === 2, String(loaded.runs));
check('company is developed', loaded.stage === 'scaleup' && loaded.cash > 4_900_000 && loaded.equity === 0.31,
  `${loaded.stage} ${Math.round(loaded.cash)} ${loaded.equity}`);
check('an advisor is on staff', loaded.advisors === 1);
await shot('dirty-save-loaded');

// ------------------------------------------------------------------- cancel
say('\n2. cancel changes nothing');
await openPanel('company');
await page.locator('#drawer-body button[data-act="reset-all"]').first().click();
await sleep(500);
const cardText = await st(() => document.getElementById('overlay-card')?.innerText || document.querySelector('#overlay')?.innerText || '');
check('the confirmation names the loss', /permanently deletes your company and all Founder progression/i.test(cardText));
check('the confirmation promises a Solo Founder', /brand-new Solo Founder with no prestige bonuses/i.test(cardText));
check('the destructive button starts disabled',
  await page.locator('#doallreset').isDisabled(), 'armed after a beat');
await shot('confirm-card');
await page.locator('#overlay button[data-act="close-overlay"]').first().click();
await sleep(400);
const afterCancel = await st(() => ({ rep: __startupTycoon.state.meta.founderRep, cash: __startupTycoon.state.company.cash, stage: __startupTycoon.state.company.stage }));
check('cancelling left reputation alone', afterCancel.rep === 99, String(afterCancel.rep));
check('cancelling left the company alone', afterCancel.stage === 'scaleup' && Math.abs(afterCancel.cash - loaded.cash) < 20_000,
  `${afterCancel.stage}, cash drifted ${Math.round(afterCancel.cash - loaded.cash)}`);

// -------------------------------------------------------------------- reset
say('\n3. confirm the reset');
await page.locator('#drawer-body button[data-act="reset-all"]').first().click();
await sleep(300);
check('still disabled immediately after opening', await page.locator('#doallreset').isDisabled());
await sleep(1200);
check('armed after the delay', !(await page.locator('#doallreset').isDisabled()));
const label = await page.locator('#doallreset').innerText();
check('the button says what it does', /reset everything/i.test(label), label);
await page.locator('#doallreset').click();
await sleep(700);
await shot('after-reset');

say('\n4. founder and meta progression are gone');
const meta = await st(() => ({
  founderRep: __startupTycoon.state.meta.founderRep,
  lifetimeRep: __startupTycoon.state.meta.lifetimeRep,
  unspent: __startupTycoon.state.meta.founderRep,
  levels: Object.values(__startupTycoon.state.meta.upgrades),
  runs: __startupTycoon.state.meta.runs.length,
  unlocked: __startupTycoon.state.meta.unlockedScenarios,
  achievements: __startupTycoon.state.meta.achievements.length,
  appliedTx: __startupTycoon.state.meta.appliedTx.length
}));
check('founder reputation is zero', meta.founderRep === 0, String(meta.founderRep));
check('lifetime reputation is zero', meta.lifetimeRep === 0, String(meta.lifetimeRep));
check('unspent points are zero', meta.unspent === 0);
check('every upgrade level is zero', meta.levels.every((v) => v === 0), meta.levels.join(','));
check('run history is empty', meta.runs === 0);
check('permanent unlocks are back to standard', meta.unlocked.length === 1 && meta.unlocked[0] === 'standard', meta.unlocked.join(','));
check('achievements cleared', meta.achievements === 0);
check('the purchase ledger is cleared', meta.appliedTx === 0);

say('\n5. the company is a first-ever Solo Founder');
const run = await st(() => {
  const s = __startupTycoon.state;
  return {
    stage: s.company.stage, cash: s.company.cash, equity: s.company.founderEquity,
    sold: s.company.ownership.soldTotal, raised: s.company.totalRaised,
    employees: s.employees.length, products: s.products.length, users: s.products[0].users,
    tier: s.office.tier, rooms: s.office.rooms.length, research: s.research.completed.length,
    rounds: s.funding.rounds.length, infra: s.infra.capacity, autoscale: s.infra.autoscale,
    advisors: s.advisors.hired.length, goalsActive: s.goals.active, goalsDone: s.goals.completed.length,
    acq: s.acquisitions.completed.length, assets: s.acquisitions.assets.length,
    roadmapHistory: s.products[0].roadmap.history.length, roadmapActive: s.products[0].roadmap.active,
    pending: s.events.pending.length, exit: s.exitResult, paused: s.time.paused,
    day: Math.round(s.time.day)
  };
});
check('stage is Solo Founder', run.stage === 'solo', run.stage);
// The clock is running, so starter cash is read with a tolerance for a day or
// two of burn rather than assumed to sit frozen on the constructor value.
check('starter cash is the 15000 a new game starts with', Math.abs(run.cash - 15000) < 400,
  `${run.cash.toFixed(2)} (delta ${(run.cash - 15000).toFixed(2)})`);
check('founder equity is 100%', run.equity === 1, String(run.equity));
check('nothing is recorded as sold', run.sold === 0);
check('no funding was raised', run.raised === 0 && run.rounds === 0);
check('one employee, the founder', run.employees === 1, String(run.employees));
check('one starter product with no users', run.products === 1 && run.users === 0, `${run.products} products, ${run.users} users`);
check('office is the starter garage', run.tier === 'garage' && run.rooms === 0, `${run.tier} ${run.rooms} rooms`);
check('research is untouched', run.research === 0);
check('infrastructure is the starter capacity', run.infra === 12 && run.autoscale === false, `${run.infra} ${run.autoscale}`);
check('no advisors', run.advisors === 0);
check('no goals active or complete', run.goalsActive === null && run.goalsDone === 0);
check('no acquisitions and no acquired assets', run.acq === 0 && run.assets === 0);
check('roadmaps are empty', run.roadmapHistory === 0 && run.roadmapActive === null);
check('the event inbox is empty', run.pending === 0);
check('no exit state', run.exit === null);
check('the game is running again', run.paused === false);
check('the clock is back to day zero', run.day === 0, String(run.day));

say('\n6. storage is clean, preferences are not');
const keys = await page.evaluate(() => Object.keys(localStorage));
check('the recovery copy is gone', !keys.includes(CORRUPT_KEY), keys.join(', '));
check('the legacy key is gone', !keys.includes(LEGACY_KEY));
check('the stale tab claim is gone', !keys.includes(TAB_KEY));
check('the UI preference survived', keys.includes(PREF_KEY));
const prefValue = await page.evaluate((k) => localStorage.getItem(k), PREF_KEY);
check('the preference still holds its value', prefValue === JSON.stringify({ reducedMotion: true }), String(prefValue));
const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), SAVE_KEY);
check('the saved meta is zeroed', stored && stored.meta && stored.meta.founderRep === 0 && stored.meta.runs.length === 0,
  stored ? `rep ${stored.meta.founderRep}, ${stored.meta.runs.length} runs` : 'no save');
check('the saved company is a Solo Founder', stored?.state?.company?.stage === 'solo' && stored?.state?.company?.cash === 15000);

say('\n7. reload keeps the clean state');
await page.reload({ waitUntil: 'networkidle' });
await boot();
await closeOverlay();
const afterReload = await st(() => ({
  rep: __startupTycoon.state.meta.founderRep,
  levelSum: Object.values(__startupTycoon.state.meta.upgrades).reduce((a, b) => a + b, 0),
  runs: __startupTycoon.state.meta.runs.length,
  stage: __startupTycoon.state.company.stage,
  cash: __startupTycoon.state.company.cash,
  equity: __startupTycoon.state.company.founderEquity,
  employees: __startupTycoon.state.employees.length,
  advisors: __startupTycoon.state.advisors.hired.length,
  day: __startupTycoon.state.time.day
}));
check('reputation is still zero after a reload', afterReload.rep === 0, String(afterReload.rep));
check('no upgrade came back', afterReload.levelSum === 0, String(afterReload.levelSum));
check('no run came back', afterReload.runs === 0);
check('still a Solo Founder', afterReload.stage === 'solo', afterReload.stage);
check('starter cash and equity intact', Math.abs(afterReload.cash - 15000) < 400 && afterReload.equity === 1,
  `${afterReload.cash.toFixed(2)}`);
check('one employee, no advisors', afterReload.employees === 1 && afterReload.advisors === 0);
check('the run started fresh, not resumed', afterReload.day < 1, String(afterReload.day));
await shot('after-reload');

say('\n8. a second reset is safe');
await openPanel('company');
await page.locator('#drawer-body button[data-act="reset-all"]').first().click();
await sleep(1400);
await page.locator('#doallreset').click();
await sleep(600);
const twice = await st(() => ({
  rep: __startupTycoon.state.meta.founderRep, cash: __startupTycoon.state.company.cash,
  stage: __startupTycoon.state.company.stage, valid: __startupTycoon.state.version
}));
check('second reset leaves the same clean state',
  twice.rep === 0 && Math.abs(twice.cash - 15000) < 400 && twice.stage === 'solo' && twice.valid === 4,
  JSON.stringify(twice));
await shot('after-second-reset');

say('\n9. controls still work afterwards');
await openPanel('products');
const panelText = await st(() => document.querySelector('#drawer-body')?.innerText || '');
check('panels render after a reset', panelText.length > 40 && !/undefined|NaN/.test(panelText));
await st(() => { __startupTycoon.state.time.paused = false; });
const before = await st(() => __startupTycoon.state.time.day);
await sleep(1500);
const after = await st(() => __startupTycoon.state.time.day);
check('the simulation runs after a reset', after > before, `${before.toFixed(3)} -> ${after.toFixed(3)}`);

say(`\n=== ${problems.length ? `${problems.length} PROBLEM(S)` : 'no problems'}: ` +
  `${problems.length ? problems.join(' | ') : 'no console errors, reset behaves'} ===`);

await browser.close();
server.kill();
process.exit(problems.length ? 1 : 0);
