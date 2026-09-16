// Browser playtest. Uses an existing Playwright install; override the path with
// PLAYWRIGHT_PATH if it lives somewhere else on this machine.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const PW = process.env.PLAYWRIGHT_PATH || '/Users/giofiore/.hermes/hermes-agent/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);

const PORT = 5199;
const URL = `http://localhost:${PORT}/`;
mkdirSync('shots', { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2500);

const problems = [];
const log = (...a) => console.log(...a);
let shotN = 0;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

const shot = async (name) => {
  const file = `shots/${String(++shotN).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file });
  log(`  shot ${file}`);
};
const st = (fn) => page.evaluate(fn);

try {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__startupTycoon, null, { timeout: 15000 });
  await page.waitForSelector('#game canvas');
  await sleep(1200);
  log('1. fresh start');
  await page.click('#overlay .btn').catch(() => {});
  await shot('fresh-start');

  const t0 = await st(() => ({
    stage: __startupTycoon.state.company.stage,
    cash: __startupTycoon.state.company.cash,
    product: __startupTycoon.state.products[0].name,
    desks: __startupTycoon.state.office.deskCapacity
  }));
  log('   ', JSON.stringify(t0));

  log('2. run 12 game days -> MVP launches');
  await st(() => __startupTycoon.debugStep(12));
  await sleep(600);
  const live = await st(() => __startupTycoon.state.products[0].stage);
  if (live !== 'live') problems.push(`product did not launch after 12 days (stage=${live})`);
  log('    product stage:', live);
  await shot('after-launch');

  log('3. hire from the Employees panel');
  await page.click('button[data-panel="employees"]');
  await sleep(300);
  await shot('employees-panel');
  const before = await st(() => __startupTycoon.state.employees.length);
  const hireBtn = page.locator('#drawer-body button[data-act="hire"]:not([disabled])').first();
  if (await hireBtn.count()) { await hireBtn.click(); await sleep(400); }
  const after = await st(() => __startupTycoon.state.employees.length);
  if (after <= before) problems.push('hiring from the UI did not add an employee');
  log(`    headcount ${before} -> ${after}`);

  log('4. queue a project from the Products panel');
  await page.click('button[data-panel="products"]');
  await sleep(300);
  const q = page.locator('#drawer-body button[data-act="queue"]:not([disabled])').first();
  await q.click();
  await sleep(300);
  const queued = await st(() => __startupTycoon.state.products[0].projects.length);
  if (!queued) problems.push('queueing a project from the UI did nothing');
  log('    queued projects:', queued);
  await shot('products-panel');

  log('5. expand the office and build rooms');
  await st(() => {
    const s = __startupTycoon.state;
    s.company.cash = 2_000_000;
    s.company.stage = 'seed';
    __startupTycoon.refresh();
  });
  await page.click('button[data-panel="office"]');
  await sleep(300);
  await page.locator('#drawer-body button[data-act="office"]:not([disabled])').first().click();
  await sleep(400);
  for (const room of ['breakroom', 'meeting', 'server']) {
    const b = page.locator(`#drawer-body button[data-act="room"][data-id="${room}"]:not([disabled])`);
    if (await b.count()) { await b.click(); await sleep(250); }
  }
  const office = await st(() => ({ tier: __startupTycoon.state.office.tier, rooms: __startupTycoon.state.office.rooms }));
  log('   ', JSON.stringify(office));
  await page.click('#drawer-close');
  await sleep(1400);
  await shot('office-expanded');

  log('6. populate the office and watch people move');
  await st(() => {
    const s = __startupTycoon.state;
    const src = s.employees[0];
    for (let i = 0; i < 10; i++) {
      s.employees.push({ ...src, id: `pt_${i}`, name: `Tester ${i}`, role: 'engineer', salary: 90000,
        dept: ['engineering', 'sales', 'support', 'marketing', 'product', 'infra'][i % 6], desk: null });
    }
    __startupTycoon.refresh();
  });
  await sleep(3000);
  await shot('office-busy');

  log('7. play the debugging minigame from an event');
  await st(() => __startupTycoon.debugEvent('critical_bug'));
  await sleep(500);
  await shot('event-inbox');
  const mg = page.locator('#events button[data-act="event"]', { hasText: 'Debug it yourself' });
  if (await mg.count()) {
    await mg.click();
    await sleep(500);
    await shot('minigame');
    for (let i = 0; i < 3; i++) {
      const cell = page.locator('#overlay-card .mg-cell').first();
      if (await cell.count()) { await cell.click(); await sleep(700); }
    }
    await sleep(1400);
    const boosts = await st(() => __startupTycoon.state.boosts.map((b) => b.id));
    log('    boosts after minigame:', JSON.stringify(boosts));
    if (!boosts.some((b) => b.startsWith('mg_'))) problems.push('minigame produced no boost');
  } else problems.push('could not find the minigame choice in the event inbox');
  await page.locator('#overlay button[data-act="close-overlay"]').click().catch(() => {});
  await sleep(300);

  log('8. save, reload, and confirm the company persisted');
  const beforeReload = await st(() => {
    __startupTycoon.save();
    return { cash: Math.round(__startupTycoon.state.company.cash), day: Math.round(__startupTycoon.state.time.day),
      staff: __startupTycoon.state.employees.length, tier: __startupTycoon.state.office.tier };
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__startupTycoon);
  await sleep(1500);
  await page.locator('#overlay button[data-act="close-overlay"]').click().catch(() => {});
  const afterReload = await st(() => ({ cash: Math.round(__startupTycoon.state.company.cash),
    day: Math.round(__startupTycoon.state.time.day), staff: __startupTycoon.state.employees.length,
    tier: __startupTycoon.state.office.tier }));
  log('    before', JSON.stringify(beforeReload), '\n    after ', JSON.stringify(afterReload));
  if (afterReload.staff !== beforeReload.staff || afterReload.tier !== beforeReload.tier) {
    problems.push('state did not survive a reload');
  }

  log('9. simulate three hours away');
  await st(() => {
    __startupTycoon.save = () => true;          // stop the unload handler re-stamping the clock
    const raw = JSON.parse(localStorage.getItem('startup-tycoon/save/v1'));
    raw.state.time.lastRealMs = Date.now() - 3 * 3600 * 1000;
    localStorage.setItem('startup-tycoon/save/v1', JSON.stringify(raw));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__startupTycoon);
  await sleep(1800);
  const summaryText = await page.locator('#overlay-card').innerText().catch(() => '');
  await shot('offline-summary');
  if (!/While you were away/i.test(summaryText)) problems.push('offline summary did not appear after a 3h gap');
  else log('    offline summary shown');
  await page.locator('#overlay button[data-act="close-overlay"]').click().catch(() => {});

  log('10. remaining panels render');
  for (const panel of ['company', 'departments', 'research', 'finance', 'competitors']) {
    await page.click(`button[data-panel="${panel}"]`);
    await sleep(350);
    const txt = await page.locator('#drawer-body').innerText();
    if (!txt || txt.length < 30) problems.push(`panel ${panel} rendered empty`);
    await shot(`panel-${panel}`);
    await page.click('#drawer-close');
    await sleep(150);
  }

  log('11. viewport sizes');
  for (const [w, h] of [[1920, 1080], [1366, 768], [1024, 700]]) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(900);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    if (overflow) problems.push(`horizontal overflow at ${w}x${h}`);
    await shot(`viewport-${w}x${h}`);
  }

  log('12. keyboard navigation');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press('Digit3');
  await sleep(300);
  const opened = await page.locator('#drawer').isVisible();
  if (!opened) problems.push('keyboard shortcut did not open a panel');
  await page.keyboard.press('Escape');
  await sleep(200);
  await page.keyboard.press('Space');
  await sleep(200);
  const paused = await st(() => __startupTycoon.state.time.paused);
  if (!paused) problems.push('space did not pause');
  await st(() => __startupTycoon.togglePause());
  log('    panel shortcut + pause toggle work');
} catch (err) {
  problems.push(`harness error: ${err.message}`);
  console.error(err);
} finally {
  await shot('final');
  await browser.close();
  server.kill();
}

console.log('\n=== playtest result ===');
if (problems.length) { console.log('PROBLEMS:'); for (const p of problems) console.log(' -', p); }
else console.log('no console errors, no broken interactions');
writeFileSync('shots/report.txt', problems.join('\n') || 'clean');
process.exit(problems.length ? 1 : 0);
