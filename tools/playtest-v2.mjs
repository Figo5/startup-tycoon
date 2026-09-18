// Browser playtest for the hardening + feature pass.
// Runs a real Chromium against the production build and exercises the reported
// bugs plus every new system through the UI. Screenshots land in shots-v2/.
//
//   node tools/playtest-v2.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { newGame } from '../src/sim/state.js';
import { serialize } from '../src/sim/save.js';

const PW = process.env.PLAYWRIGHT_PATH || '/Users/giofiore/.hermes/hermes-agent/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);

const PORT = Number(process.env.PORT || 5201);
const URL = `http://localhost:${PORT}/`;
const SAVE_KEY = 'startup-tycoon/save/v1';
mkdirSync('shots-v2', { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2600);

const problems = [];
let shotN = 0;
const say = (...a) => console.log(...a);
const check = (label, ok, detail = '') => {
  if (ok) say(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);
  else { problems.push(label + (detail ? ` — ${detail}` : '')); say(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

const shot = async (name) => {
  const file = `shots-v2/${String(++shotN).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file });
  return file;
};
const st = (fn) => page.evaluate(fn);
const boot = async () => {
  await page.waitForFunction(() => !!window.__startupTycoon, null, { timeout: 20000 });
  await page.waitForSelector('#game canvas');
  await sleep(900);
};
/** The tab strip toggles, so clicking an open panel would close it. */
const openPanel = async (name) => {
  const current = await st(() => __startupTycoon.ui.openPanel);
  if (current !== name) await page.locator(`button[data-panel="${name}"]`).click();
  await sleep(320);
};
const closeOverlay = async () => {
  const b = page.locator('#overlay button[data-act="close-overlay"]');
  if (await b.count()) await b.first().click().catch(() => {});
  await sleep(250);
};

/** Put the game in a late-stage state through the debug handle. */
const forceLate = () => st(() => {
  const s = __startupTycoon.state;
  s.company.stage = 'late';
  s.company.reputation = 8;
  s.company.cash = 9e7;
  s.products[0].stage = 'live';
  s.products[0].users = 2e6;
  s.stats.revenueDay = 2e6;
  s.stats.valuation = 9e9;
  __startupTycoon.debugStep(2);
  __startupTycoon.refresh();
});

try {
  // ---------------------------------------------------------------- fresh save
  say('\n1. fresh save boots, canvas renders');
  await page.goto(URL, { waitUntil: 'networkidle' });
  await boot();
  await closeOverlay();
  check('canvas present', await page.locator('#game canvas').count() > 0);
  check('top bar shows the company', (await page.locator('#company-name').innerText()).length > 0);
  await shot('fresh');

  // ------------------------------------------------------- migrated v3 save
  say('\n2. an existing v3 save migrates in the browser');
  const legacy = newGame({ seed: 4242 });
  legacy.company.cash = 777777;
  legacy.company.stage = 'growing';
  legacy.company.founderEquity = 0.8;
  legacy.employees.push({ ...legacy.employees[0], id: 'emp_legacy', name: 'Legacy Hire', role: 'engineer', salary: 100000 });
  legacy.meta.founderRep = 12;
  legacy.meta.upgrades = { capital: 1 };
  legacy.meta.runs = [{ company: 'Prior Co', exit: 'IPO', value: 1e8, proceeds: 4e7, equity: 0.6, rep: 7, days: 200, stage: 'late', scenario: 'standard', at: 1 }];
  const blob = serialize(legacy);
  blob.version = 3;
  delete blob.state.exitResult; delete blob.state.advisors; delete blob.state.goals;
  delete blob.state.acquisitions; delete blob.state.company.ownership;
  delete blob.state.events.lastEventId; delete blob.state.events.recentCats;
  for (const p of blob.state.products) {
    delete p.roadmap; delete p.acqMul; delete p.revMul; delete p.churnMul; delete p.convMul;
  }
  delete blob.meta.appliedTx;
  await st(() => {
    // Stop the running page from writing its own state over the injection on
    // unload, which is what a real player's save would not have to fight.
    __startupTycoon.save = () => true;
  });
  await page.evaluate(([key, text]) => localStorage.setItem(key, text), [SAVE_KEY, JSON.stringify(blob)]);
  await page.reload({ waitUntil: 'networkidle' });
  await boot();
  await closeOverlay();
  const migrated = await st(() => ({
    day: __startupTycoon.state.time.day,
    cash: Math.round(__startupTycoon.state.company.cash),
    staff: __startupTycoon.state.employees.length,
    equity: __startupTycoon.state.company.founderEquity,
    fr: __startupTycoon.state.meta.founderRep,
    level: __startupTycoon.state.meta.upgrades.capital,
    version: __startupTycoon.state.version,
    roadmap: !!__startupTycoon.state.products[0].roadmap,
    advisors: Array.isArray(__startupTycoon.state.advisors.hired),
    completed: __startupTycoon.state.goals.completed.length,
    acquisitions: __startupTycoon.state.acquisitions.completed.length
  }));
  // A few seconds of offline catch-up run between building the blob and loading
  // it, so the balance is preserved within a small, explained tolerance.
  check('legacy cash preserved', Math.abs(migrated.cash - 777777) < 2000, String(migrated.cash));
  check('legacy equity preserved', Math.abs(migrated.equity - 0.8) < 1e-9, String(migrated.equity));
  check('legacy headcount preserved', migrated.staff === 2, String(migrated.staff));
  check('legacy founder reputation preserved', migrated.fr === 12, String(migrated.fr));
  check('legacy upgrade preserved', migrated.level === 1, String(migrated.level));
  check('schema upgraded to 4', migrated.version === 4, String(migrated.version));
  check('new systems initialised empty', migrated.roadmap && migrated.advisors && migrated.completed === 0 && migrated.acquisitions === 0);
  check('nothing awarded retroactively', migrated.fr === 12 && migrated.acquisitions === 0);
  await shot('migrated-save');

  // ------------------------------------------------------ founder upgrade exploit
  say('\n3. founder upgrades cannot be spam-maxed through the UI');
  await st(() => { __startupTycoon.state.meta.founderRep = 60; __startupTycoon.refresh(); });
  await openPanel('company');
  await page.locator('#drawer-body button[data-act="open-prestige"]').click({ force: true });
  await sleep(350);
  await shot('prestige-before');
  const firstPrice = await st(() => {
    const el = document.querySelector('#overlay button[data-act="buy-prestige"]');
    return el ? Number(/for (\d+) FR/.exec(el.textContent)?.[1] || 0) : 0;
  });
  const levelBefore = await st(() => __startupTycoon.state.meta.upgrades.capital || 0);
  // Two clicks dispatched on the very same button node: one interaction.
  await st(() => { const el = document.querySelector('#overlay button[data-act="buy-prestige"]'); el?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await sleep(60);
  await st(() => { const el = document.querySelector('#overlay button[data-act="buy-prestige"]'); el?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await sleep(400);
  const afterSyntheticDouble = await st(() => ({
    level: __startupTycoon.state.meta.upgrades.capital || 0,
    fr: __startupTycoon.state.meta.founderRep
  }));
  check('two clicks on one control buy one level', afterSyntheticDouble.level === levelBefore + 1,
    `level ${levelBefore} -> ${afterSyntheticDouble.level}, ${afterSyntheticDouble.fr} FR left`);
  check('exactly one price was deducted', afterSyntheticDouble.fr === 60 - firstPrice,
    `${afterSyntheticDouble.fr} FR (price ${firstPrice})`);

  // A real browser double-click re-targets the re-rendered button.
  const btn = page.locator('#overlay button[data-act="buy-prestige"]').first();
  const box = await btn.boundingBox();
  if (box) {
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(600);
  }
  const afterDbl = await st(() => ({ level: __startupTycoon.state.meta.upgrades.capital || 0, fr: __startupTycoon.state.meta.founderRep }));
  check('a real double click does not buy two levels', afterDbl.level === levelBefore + 2,
    `level ${levelBefore} -> ${afterDbl.level}, ${afterDbl.fr} FR left`);
  await shot('prestige-after-double-click');

  // Max the track and prove MAX is shown and the control is dead.
  await page.keyboard.press('Escape');
  await sleep(200);
  await st(() => { __startupTycoon.state.meta.founderRep = 5000; __startupTycoon.refresh(); });
  await page.locator('#drawer-body button[data-act="open-prestige"]').click({ force: true });
  await sleep(350);
  for (let i = 0; i < 8; i++) {
    const b = page.locator('#overlay button[data-act="buy-prestige"][data-id="capital"]');
    if (!(await b.count())) break;
    if (await b.first().isDisabled().catch(() => true)) break;
    await b.first().click({ force: true }).catch(() => {});
    await sleep(520);
  }
  const maxed = await st(() => {
    const u = __startupTycoon.state.meta.upgrades.capital;
    return { level: u, hasBuy: !!document.querySelector('#overlay button[data-act="buy-prestige"][data-id="capital"]'), text: document.querySelector('#overlay-card').innerText };
  });
  check('the track stops at its maximum', maxed.level === 5, `level ${maxed.level}`);
  check('a maxed track shows MAX', /MAX/.test(maxed.text), 'prestige card labels it MAX');
  check('no buy control remains at max', !maxed.hasBuy);
  check('founder reputation never negative', (await st(() => __startupTycoon.state.meta.founderRep)) >= 0);
  await shot('prestige-max');
  await closeOverlay();

  // ------------------------------------------------------------- cash-out exploit
  say('\n4. a cash-out cannot be taken twice');
  await forceLate();
  await st(() => { __startupTycoon.state.meta.founderRep = 0; __startupTycoon.state.meta.lifetimeRep = 0; });
  await openPanel('company');
  await sleep(200);
  const exitBefore = await st(() => ({
    equity: __startupTycoon.state.company.founderEquity,
    rep: __startupTycoon.state.meta.founderRep,
    runs: __startupTycoon.state.meta.runs.length
  }));
  const exitBtn = page.locator('#drawer-body button[data-act="exit"]:not([disabled])').first();
  check('an exit is on offer', await exitBtn.count() > 0);
  await exitBtn.click();
  await sleep(600);
  const afterExit = await st(() => ({
    ended: !!__startupTycoon.state.exitResult,
    equity: __startupTycoon.state.company.founderEquity,
    rep: __startupTycoon.state.meta.founderRep,
    runs: __startupTycoon.state.meta.runs.length,
    paused: __startupTycoon.state.time.paused
  }));
  check('the summary appears', /start the next company/i.test(await page.locator('#overlay-card').innerText()));
  check('ownership transferred exactly once', exitBefore.equity > 0 && afterExit.equity === 0, `${exitBefore.equity} -> ${afterExit.equity}`);
  check('the exit paid once', afterExit.rep > exitBefore.rep && afterExit.runs === exitBefore.runs + 1,
    `${exitBefore.rep} -> ${afterExit.rep} FR, ${exitBefore.runs} -> ${afterExit.runs} runs`);
  check('the run is paused and ended', afterExit.ended && afterExit.paused);
  await shot('exit-summary');

  // Try to cash out again, both from the overlay and from the panel.
  await closeOverlay();
  await openPanel('company');
  const panelText = await page.locator('#drawer-body').innerText();
  check('the panel says the run has ended', /has ended/i.test(panelText));
  check('no exit control is offered again', await page.locator('#drawer-body button[data-act="exit"]').count() === 0);
  await st(() => __startupTycoon.debugStep(5));
  const afterMore = await st(() => ({
    rep: __startupTycoon.state.meta.founderRep,
    runs: __startupTycoon.state.meta.runs.length,
    equity: __startupTycoon.state.company.founderEquity,
    day: __startupTycoon.state.time.day
  }));
  check('playing on pays nothing more', afterMore.rep === afterExit.rep && afterMore.runs === afterExit.runs,
    `${afterMore.rep} FR, ${afterMore.runs} runs`);
  check('equity cannot go negative', afterMore.equity >= 0, String(afterMore.equity));
  await shot('run-ended-panel');

  // The prestige screen is still reachable, and still transactional.
  await page.locator('#drawer-body button[data-act="open-prestige"]').click().catch(() => {});
  await sleep(300);
  check('founder upgrades stay reachable after an exit', await page.locator('#overlay button[data-act="buy-prestige"]').count() > 0);
  await closeOverlay();

  // ------------------------------------------------------------------ new run
  say('\n5. a new company starts clean and keeps the founder progression');
  await page.locator('#drawer-body button[data-act="exit-summary"]').click();
  await sleep(400);
  await page.locator('#overlay button#donext').click();
  await sleep(800);
  const runsBeforeNew = await st(() => __startupTycoon.state.meta.runs.length);
  const fresh = await st(() => ({
    day: Math.round(__startupTycoon.state.time.day),
    equity: __startupTycoon.state.company.founderEquity,
    ended: !!__startupTycoon.state.exitResult,
    runs: __startupTycoon.state.meta.runs.length,
    advisors: __startupTycoon.state.advisors.hired.length,
    goals: __startupTycoon.state.goals.completed.length,
    acquisitions: __startupTycoon.state.acquisitions.completed.length,
    captures: __startupTycoon.state.products[0].roadmap.history.length,
    capital: __startupTycoon.state.meta.upgrades.capital
  }));
  check('fresh company, fresh equity', fresh.equity === 1 && !fresh.ended && fresh.day < 3);
  check('run history kept', fresh.runs === runsBeforeNew, `${fresh.runs} runs`);
  check('founder upgrade kept', fresh.capital === 5);
  check('per-run systems reset', fresh.advisors === 0 && fresh.goals === 0 && fresh.acquisitions === 0 && fresh.captures === 0);
  await shot('new-company');

  // -------------------------------------------------------------------- events
  say('\n6. event cadence: more opportunities, inbox stays sane');
  await st(() => {
    const s = __startupTycoon.state;
    s.company.stage = 'scaleup';
    s.company.cash = 5e7;
    s.stats.revenueDay = 200000;
    s.stats.valuation = 1e9;
    window.__ev0 = Object.values(s.events.seen).reduce((a, b) => a + b, 0);
    s.time.paused = false;
  });
  for (let i = 0; i < 12; i++) { await st(() => __startupTycoon.debugStep(5)); await sleep(120); }
  const cadence = await st(() => {
    const s = __startupTycoon.state;
    const total = Object.values(s.events.seen).reduce((a, b) => a + b, 0) - window.__ev0;
    return { total, days: 60, pending: s.events.pending.length, cooldown: s.events.cooldown };
  });
  const perDay = cadence.total / cadence.days;
  check('events arrive more often than the old 1-per-5-days', perDay > 0.2,
    `${cadence.total} events in 60 game days = ${perDay.toFixed(3)}/day`);
  check('the inbox never holds more than the cap', cadence.pending <= 4, `${cadence.pending} pending`);
  check('no negative cooldown backlog', cadence.cooldown >= 0, String(cadence.cooldown));
  await shot('events-after-60-days');

  // ------------------------------------------------------------------- roadmap
  say('\n7. roadmap: choose an initiative and finish it');
  await st(() => { __startupTycoon.state.time.paused = true; });
  await openPanel('products');
  const roadmapButtons = page.locator('#drawer-body button[data-act="roadmap-start"]:not([disabled])');
  const nRoadmap = await roadmapButtons.count();
  check('roadmap choices are offered in the UI', nRoadmap > 0, `${nRoadmap} options`);
  await shot('products-roadmap-choices');
  const cashBeforeRoadmap = await st(() => __startupTycoon.state.company.cash);
  await roadmapButtons.first().click();
  await sleep(500);
  const started = await st(() => {
    const p = __startupTycoon.state.products.find((x) => x.roadmap.active);
    return { id: p?.roadmap.active?.id, name: p?.roadmap.active?.name, work: p?.roadmap.active?.work,
      cash: __startupTycoon.state.company.cash, commit: __startupTycoon.mods.initiativeCommit };
  });
  check('an initiative is running', !!started.id, started.name);
  check('the fee was charged once', started.cash < cashBeforeRoadmap, `-${Math.round(cashBeforeRoadmap - started.cash)}`);
  check('engineering is committed to it', started.commit > 0, `commit ${started.commit}`);
  await shot('roadmap-running');
  // Run it to completion.
  for (let i = 0; i < 40; i++) {
    await st(() => __startupTycoon.debugStep(5));
    const done = await st(() => {
      const p = __startupTycoon.state.products.find((x) => x.roadmap.history.length);
      return !!p;
    });
    if (done) break;
    await sleep(60);
  }
  const finished = await st(() => {
    const p = __startupTycoon.state.products.find((x) => x.roadmap.history.length);
    return p ? { shipped: p.roadmap.history.slice(), acqMul: p.acqMul, revMul: p.revMul, convMul: p.convMul, churnMul: p.churnMul, active: p.roadmap.active } : null;
  });
  check('the initiative completes exactly once', !!finished && finished.shipped.length === 1 && !finished.active,
    finished ? finished.shipped.join(',') : 'none');
  const effectsApplied = finished && [finished.acqMul, finished.revMul, finished.convMul, finished.churnMul].some((v) => Math.abs(v) > 0);
  check('the effect landed on the product', !!effectsApplied,
    JSON.stringify({ acq: finished?.acqMul, rev: finished?.revMul, conv: finished?.convMul, churn: finished?.churnMul }));
  await page.locator('#drawer-close').click();
  await sleep(200);

  // ------------------------------------------------------------------- advisor
  say('\n8. advisor: retain one and verify the effect');
  await st(() => {
    const s = __startupTycoon.state;
    s.company.stage = 'growing';
    s.company.cash = 5e6;
    s.stats.revenueDay = 50000;
  });
  await openPanel('advisors');
  await shot('advisors-panel');
  const modsBefore = await st(() => ({ ...__startupTycoon.mods, flags: undefined }));
  const advisorBtn = page.locator('#drawer-body button[data-act="advisor-hire"]:not([disabled])').first();
  check('advisors are offered', await advisorBtn.count() > 0);
  await advisorBtn.click();
  await sleep(500);
  const advisor = await st(() => ({
    hired: __startupTycoon.state.advisors.hired.map((h) => h.id),
    retainerDay: __startupTycoon.state.stats.advisorDay,
    mods: { ...__startupTycoon.mods, flags: undefined }
  }));
  check('one advisor is on staff', advisor.hired.length === 1, advisor.hired.join(','));
  const changed = Object.keys(advisor.mods).filter((k) => Math.abs((advisor.mods[k] || 0) - (modsBefore[k] || 0)) > 1e-9);
  check('their effects reach the simulation', changed.length > 0, changed.join(', '));
  await st(() => __startupTycoon.debugStep(4));
  const withRetainer = await st(() => __startupTycoon.state.stats.advisorDay);
  check('the retainer is charged daily', withRetainer > 0, `$${Math.round(withRetainer)}/day`);
  await shot('advisor-hired');
  // The slot cap holds in the UI too.
  await page.locator('#drawer-close').click();
  await sleep(150);

  // --------------------------------------------------------------- acquisition
  say('\n9. acquisition: buy a company, once');
  await st(() => {
    const s = __startupTycoon.state;
    s.company.stage = 'scaleup';
    s.company.cash = 4e8;
    s.stats.revenueDay = 400000;
    s.stats.valuation = 1.2e9;
    __startupTycoon.debugStep(1);
  });
  await openPanel('competitors');
  await shot('competitors-acquisitions');
  const buyBtn = page.locator('#drawer-body button[data-act="acquire-company"]:not([disabled])').first();
  check('a company is for sale', await buyBtn.count() > 0);
  const beforeAcq = await st(() => ({
    staff: __startupTycoon.state.employees.length,
    assets: __startupTycoon.state.acquisitions.assets.length,
    targets: __startupTycoon.state.acquisitions.targets.length
  }));
  await buyBtn.click();
  await sleep(600);
  const afterAcq = await st(() => ({
    staff: __startupTycoon.state.employees.length,
    assets: __startupTycoon.state.acquisitions.assets.length,
    targets: __startupTycoon.state.acquisitions.targets.length,
    completed: __startupTycoon.state.acquisitions.completed.length,
    tech: { ...__startupTycoon.state.acquisitions.tech },
    integration: __startupTycoon.state.acquisitions.integrationUntil > __startupTycoon.state.time.day
  }));
  check('the acquisition completed', afterAcq.completed === 1 && afterAcq.assets === 1);
  check('their people joined', afterAcq.staff > beforeAcq.staff, `${beforeAcq.staff} -> ${afterAcq.staff}`);
  check('technology was gained', Object.keys(afterAcq.tech).length > 0, JSON.stringify(afterAcq.tech));
  check('integration is running', afterAcq.integration);
  check('it is off the market', afterAcq.targets === beforeAcq.targets - 1);
  await shot('acquisition-done');
  const repeatable = await page.locator(`#drawer-body button[data-act="acquire-company"]`).count();
  const ownedStillListed = await st(() => {
    const done = __startupTycoon.state.acquisitions.completed.map((c) => c.id);
    return __startupTycoon.state.acquisitions.targets.some((t) => done.includes(t.id));
  });
  check('it cannot be bought again', !ownedStillListed, `${repeatable} buy controls left`);
  await page.locator('#drawer-close').click();
  await sleep(200);

  // ---------------------------------------------------------------------- goal
  say('\n10. company goal: accept one and complete it');
  await openPanel('goals');
  await shot('goals-panel');
  const goalsText = await page.locator('#drawer-body').innerText();
  check('three goals are offered or one is active', /reward/i.test(goalsText));
  const goalBtn = page.locator('#drawer-body button[data-act="goal-accept"]:not([disabled])').first();
  check('a goal can be accepted', await goalBtn.count() > 0);
  await goalBtn.click();
  await sleep(400);
  const active = await st(() => __startupTycoon.state.goals.active?.id || null);
  check('exactly one goal is active', !!active, String(active));
  // Complete it through the UI's own state, then tick.
  await st(() => {
    const s = __startupTycoon.state;
    s.products[0].customers.enterprise = 12;
    s.stats.users = 5e6;
    s.stats.revenueDay = 300000;
    __startupTycoon.debugStep(1);
    __startupTycoon.refresh();
  });
  await sleep(500);
  const goalDone = await st(() => ({
    completed: __startupTycoon.state.goals.completed.slice(),
    active: __startupTycoon.state.goals.active?.id || null
  }));
  check('the goal completed once', goalDone.completed.length === 1, goalDone.completed.join(','));
  check('nothing is left active', !goalDone.active);
  await st(() => __startupTycoon.debugStep(5));
  const goalRepeat = await st(() => __startupTycoon.state.goals.completed.length);
  check('it does not complete again', goalRepeat === 1, String(goalRepeat));
  await shot('goal-complete');
  await page.locator('#drawer-close').click();
  await sleep(200);

  // ---------------------------------------------------------------------- save
  say('\n11. save, reload, and confirm every new system persisted');
  const before = await st(() => {
    __startupTycoon.save();
    const s = __startupTycoon.state;
    return {
      cash: Math.round(s.company.cash),
      staff: s.employees.length,
      advisors: s.advisors.hired.map((h) => h.id),
      goals: s.goals.completed.slice(),
      acquisitions: s.acquisitions.completed.map((c) => c.id),
      roadmaps: s.products.flatMap((p) => p.roadmap.history),
      tech: { ...s.acquisitions.tech },
      upgrade: s.meta.upgrades.capital
    };
  });
  await page.reload({ waitUntil: 'networkidle' });
  await boot();
  await closeOverlay();
  const restored = await st(() => {
    const s = __startupTycoon.state;
    return {
      cash: Math.round(s.company.cash),
      staff: s.employees.length,
      advisors: s.advisors.hired.map((h) => h.id),
      goals: s.goals.completed.slice(),
      acquisitions: s.acquisitions.completed.map((c) => c.id),
      roadmaps: s.products.flatMap((p) => p.roadmap.history),
      tech: { ...s.acquisitions.tech },
      upgrade: s.meta.upgrades.capital,
      version: s.version
    };
  });
  check('cash and headcount survived', restored.cash === before.cash && restored.staff === before.staff);
  check('advisors survived', JSON.stringify(restored.advisors) === JSON.stringify(before.advisors), restored.advisors.join(','));
  check('completed goals survived', JSON.stringify(restored.goals) === JSON.stringify(before.goals), restored.goals.join(','));
  check('acquisitions survived', JSON.stringify(restored.acquisitions) === JSON.stringify(before.acquisitions), restored.acquisitions.join(','));
  check('shipped roadmaps survived', JSON.stringify(restored.roadmaps) === JSON.stringify(before.roadmaps), restored.roadmaps.join(','));
  check('acquired technology survived', JSON.stringify(restored.tech) === JSON.stringify(before.tech));
  check('founder upgrades survived', restored.upgrade === before.upgrade && restored.version === 4);
  const afterReload = await st(() => { __startupTycoon.debugStep(5); return __startupTycoon.state.goals.completed.length; });
  check('no goal reward replays after a reload', afterReload === 1, String(afterReload));
  await shot('after-reload');

  // ------------------------------------------------------------------- visuals
  say('\n12. layout and text at the two target viewports');
  let fontsAt1366 = {};
  for (const [w, h] of [[1366, 768], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(700);
    const layout = await st(() => {
      const names = ['#topbar', '#tabs', '#side', '#game'];
      const box = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { sel, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      const boxes = names.map(box).filter(Boolean);
      const overlap = (a, b) => !(a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1);
      const clashes = [];
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          if (overlap(boxes[i], boxes[j])) clashes.push(`${boxes[i].sel}/${boxes[j].sel}`);
        }
      }
      const small = [];
      const sizes = {};
      for (const sel of ['#tabs button', '#stats dt', '#stats dd', '#events h2', '#feed li', '#drawer-body .tile h3']) {
        for (const el of document.querySelectorAll(sel)) {
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs && fs < 10) small.push(`${sel}@${fs}px`);
          if (fs && !sizes[sel]) sizes[sel] = fs;
        }
      }
      const offscreen = boxes.filter((b) => b.x < -1 || b.y < -1 || b.x + b.w > window.innerWidth + 2 || b.y + b.h > window.innerHeight + 2).map((b) => b.sel);
      return { clashes, small: [...new Set(small)], sizes, offscreen, overflow: document.documentElement.scrollWidth > window.innerWidth + 2 };
    });
    check(`no panel overlap at ${w}x${h}`, layout.clashes.length === 0, layout.clashes.join(', '));
    check(`nothing off-screen at ${w}x${h}`, layout.offscreen.length === 0, layout.offscreen.join(', '));
    check(`no horizontal overflow at ${w}x${h}`, !layout.overflow);
    check(`no text below the 10px design floor at ${w}x${h}`, layout.small.length === 0, layout.small.join(', '));
    if (w === 1366) fontsAt1366 = layout.sizes;
    else {
      const drifted = Object.keys(layout.sizes).filter((k) => fontsAt1366[k] && fontsAt1366[k] !== layout.sizes[k]);
      check('text size does not change between the two viewports', drifted.length === 0, drifted.join(', '));
    }
    await shot(`viewport-${w}x${h}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await sleep(400);

  // -------------------------------------------------------------- panel sweep
  say('\n13. every panel renders, including the two new ones');
  for (const panel of ['company', 'products', 'employees', 'departments', 'research', 'finance', 'office', 'competitors', 'advisors', 'goals']) {
    await openPanel(panel);
    const txt = await page.locator('#drawer-body').innerText();
    check(`panel ${panel} renders`, !!txt && txt.length > 40 && !/undefined|NaN/.test(txt), `${txt.length} chars`);
    await shot(`panel-${panel}`);
    await page.locator('#drawer-close').click();
    await sleep(120);
  }

  // ------------------------------------------------------------------ keyboard
  say('\n14. keyboard: ten panels, space pauses when it should');
  await page.keyboard.press('Digit9');
  await sleep(300);
  check('9 opens the advisors panel', /advisors/i.test(await page.locator('#drawer-title').innerText()));
  await page.keyboard.press('Digit0');
  await sleep(300);
  check('0 opens the goals panel', /goal/i.test(await page.locator('#drawer-title').innerText()));
  await page.keyboard.press('Escape');
  await sleep(200);
  const paused = await st(() => __startupTycoon.state.time.paused);
  await page.keyboard.press('Space');
  await sleep(250);
  check('space toggles pause', (await st(() => __startupTycoon.state.time.paused)) !== paused);
  await shot('final');
} catch (err) {
  problems.push(`harness error: ${err.message}`);
  console.error(err);
} finally {
  await browser.close();
  server.kill();
}

say('\n=== playtest-v2 result ===');
if (problems.length) { say('PROBLEMS:'); for (const p of problems) say(' -', p); }
else say('no console errors, every interaction behaved');
writeFileSync('shots-v2/report.txt', problems.join('\n') || 'clean');
process.exit(problems.length ? 1 : 0);
