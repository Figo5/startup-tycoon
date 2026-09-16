import Phaser from 'phaser';
import OfficeScene from './render/OfficeScene.js';
import { createUI } from './ui/ui.js';
import { employeeCard } from './ui/panels.js';
import { newGame, REAL_SECONDS_PER_DAY, OFFLINE_CAP_HOURS } from './sim/state.js';
import { step, runOffline, LIVE_STEP_SECONDS } from './sim/engine.js';
import { spawnEvent } from './sim/events.js';
import { computeMods } from './sim/modifiers.js';
import { save, load, exportSave, importSave, resetGame, claimTab } from './sim/save.js';
import { performExit, startNextRun, availableScenarios } from './sim/prestige.js';
import { money, abbrev, fmtDuration } from './sim/util.js';
import { stageById } from './data/stages.js';

const TAB_ID = Math.random().toString(36).slice(2);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const app = {
  state: null,
  mods: null,
  ui: null,
  game: null,
  notify(text, kind = 'info') { app.ui?.pushFeed(text, kind); },
  log(text, kind = 'info') { app.ui?.pushFeed(text, kind); },
  refresh() { app.mods = computeMods(app.state); app.ui?.render(); },
  togglePause() {
    app.state.time.paused = !app.state.time.paused;
    app.state.time.lastRealMs = Date.now();
    app.refresh();
  },
  save() { app.state.time.lastRealMs = Date.now(); return save(app.state); },
  exportSave() {
    const text = exportSave(app.state);
    app.ui.showOverlay(`<h2>Export save</h2>
      <p class="muted small">Copy this text somewhere safe. Importing it restores this company exactly.</p>
      <textarea rows="8" readonly id="exp">${text}</textarea>
      <div class="row" style="margin-top:10px">
        <button class="btn" id="copy">Copy to clipboard</button>
        <button class="btn secondary" data-act="close-overlay">Close</button></div>`);
    document.getElementById('exp').select();
    document.getElementById('copy').onclick = () => {
      navigator.clipboard?.writeText(text).then(() => app.notify('Save copied to clipboard.', 'good'));
    };
  },
  importSave() {
    app.ui.showOverlay(`<h2>Import save</h2>
      <p class="muted small">Paste an exported save. Your current company is only replaced if the file validates.</p>
      <textarea rows="8" id="imp" placeholder="paste here"></textarea>
      <div class="row" style="margin-top:10px">
        <button class="btn" id="doimp">Import</button>
        <button class="btn secondary" data-act="close-overlay">Cancel</button></div>
      <p id="imperr" class="small" style="color:var(--bad)"></p>`);
    document.getElementById('doimp').onclick = () => {
      const r = importSave(document.getElementById('imp').value);
      if (!r.ok) { document.getElementById('imperr').textContent = r.reason; return; }
      app.state = r.state;
      app.state.time.lastRealMs = Date.now();
      app.refresh();
      app.save();
      app.ui.hideOverlay();
      app.notify('Save imported.', 'good');
    };
  },
  resetGame() {
    app.ui.showOverlay(`<h2>Reset company</h2>
      <p>This ends the current run without an exit and starts over. Founder Reputation and permanent upgrades are kept.</p>
      <div class="row"><button class="btn danger" id="doreset">Yes, start over</button>
      <button class="btn secondary" data-act="close-overlay">Cancel</button></div>`);
    document.getElementById('doreset').onclick = () => {
      app.state = resetGame(true);
      app.state.time.lastRealMs = Date.now();
      app.refresh();
      app.save();
      app.ui.hideOverlay();
      app.notify('New company founded.', 'stage');
    };
  },
  onExit(exitId) {
    const r = performExit(app.state, app.mods, exitId);
    if (!r.ok) { app.notify(r.reason, 'bad'); return; }
    const meta = r.meta;
    const sum = r.summary;
    const scenarios = availableScenarios(meta);
    app.ui.showOverlay(`<h2>${sum.name}</h2>
      <p class="muted">${stageById(app.state.company.stage).name} · ${sum.days} days · ${app.state.employees.length} people</p>
      <div class="tile">
        <div class="spread"><span>Company value</span><b>${money(sum.value)}</b></div>
        <div class="spread"><span>Your stake</span><b>${(app.state.company.founderEquity * 100).toFixed(1)}%</b></div>
        <div class="spread"><span>Proceeds</span><b>${money(sum.proceeds)}</b></div>
        <div class="spread"><span>Founder Reputation earned</span><b style="color:var(--accent)">+${sum.rep} FR</b></div>
      </div>
      ${sum.achievements.length ? `<p class="small">Achievements: ${sum.achievements.join(', ')}</p>` : ''}
      <hr />
      <h3>Start the next company</h3>
      <label class="small">Name <input type="text" id="nextname" value="${randomCompanyName()}" /></label>
      <label class="small">Market
        <select id="nextscenario">${scenarios.map((s) => `<option value="${s.id}">${s.name} — ${s.desc} (${s.repMul}x FR)</option>`).join('')}</select>
      </label>
      <div class="row" style="margin-top:12px">
        <button class="btn" id="donext">Found it</button>
        <button class="btn secondary" data-act="open-prestige">Spend Founder Reputation first</button>
      </div>`);
    document.getElementById('donext').onclick = () => {
      app.state = startNextRun(meta, {
        companyName: document.getElementById('nextname').value || randomCompanyName(),
        scenarioId: document.getElementById('nextscenario').value
      });
      app.state.time.lastRealMs = Date.now();
      app.refresh();
      app.save();
      app.ui.hideOverlay();
      app.notify('A new company. Same founder.', 'stage');
    };
  },
  showHelp() {
    app.ui.showOverlay(`<h2>How to play</h2>
      <p>You are a solo founder with one product and enough cash to last a few weeks. The company runs whether
      you are watching or not.</p>
      <ul class="small">
        <li><b>Passive</b> — close the tab. Up to ${OFFLINE_CAP_HOURS} hours of progress is credited when you come back.</li>
        <li><b>Management</b> — every minute or two there is something worth doing: hire, queue work, expand, spend.</li>
        <li><b>Active</b> — some events offer a short puzzle (marked ▶). Optional, always, but they pay well.</li>
      </ul>
      <p class="small"><b>Keys</b> — 1-8 open panels · Space pauses · Esc closes · WASD or arrows pan the office ·
      Q/E or the wheel zoom · ? shows this.</p>
      <p class="small"><b>The loop</b> — engineering turns payroll into shipped work; shipped work raises quality and
      the size of your market; marketing and sales fill that market; support and reliability stop it leaking away.
      Reaching the next company stage widens every market at once.</p>
      <p class="small">Events left alone resolve conservatively. You will never come back to a destroyed company.</p>
      <div class="row"><button class="btn" data-act="close-overlay">Got it</button></div>`);
  }
};

function randomCompanyName() {
  const a = ['Northwind', 'Paper Crane', 'Lantern', 'Bluefir', 'Ninth Floor', 'Tidewater', 'Foxglove',
    'Granite', 'Halyard', 'Copperline', 'Umbra', 'Signal'];
  const b = ['Labs', 'Software', 'Systems', 'Works', 'Technologies', 'Computing', 'Industries'];
  return `${a[Math.floor(Math.random() * a.length)]} ${b[Math.floor(Math.random() * b.length)]}`;
}

// ------------------------------------------------------------------ boot
function boot() {
  const tab = claimTab(TAB_ID);
  const loaded = load();
  if (loaded.ok) {
    app.state = loaded.state;
  } else {
    app.state = newGame({ companyName: randomCompanyName() });
    if (loaded.corrupt) setTimeout(() => app.notify(loaded.reason, 'bad'), 400);
  }
  app.mods = computeMods(app.state);
  app.ui = createUI(app);
  app.refresh();

  if (!tab.owner) {
    app.ui.showOverlay(`<h2>Another tab is already running</h2>
      <p>Startup Tycoon saves to one slot. Running two tabs will make them overwrite each other.</p>
      <p class="muted small">Close the other tab, or continue here and accept that the last save wins.</p>
      <div class="row"><button class="btn" data-act="close-overlay">Continue anyway</button></div>`);
  }

  // Offline catch-up before the first frame, so rewards are settled once.
  const summary = runOffline(app.state);
  app.refresh();
  if (summary && summary.gameDays > 0.25) showOfflineSummary(summary);
  else if (!loaded.ok) app.showHelp();

  app.game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#15131d',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.NO_CENTER },
    scene: [OfficeScene]
  });
  app.game.scene.start('office', {
    game$: { state: app.state, onSelectEmployee: (id) => app.ui.showOverlay(employeeCardHtml(id)) },
    reducedMotion
  });
  // The scene holds a reference to game$, so keep its state pointer fresh across resets.
  setInterval(() => {
    const scene = app.game.scene.getScene('office');
    if (scene?.game$) scene.game$.state = app.state;
  }, 500);

  // Exposed so the playtest harness (and curious players) can poke at a run.
  app.debugStep = (days) => {
    for (let d = 0; d < days; d += 0.05) step(app.state, Math.min(0.05, days - d), app.log);
    app.refresh();
  };
  app.debugEvent = (id) => { spawnEvent(app.state, id); app.refresh(); };
  window.__startupTycoon = app;

  document.getElementById('btn-pause').onclick = app.togglePause;
  document.getElementById('btn-help').onclick = app.showHelp;
  document.getElementById('app').setAttribute('aria-busy', 'false');

  window.addEventListener('beforeunload', () => app.save());
  document.addEventListener('visibilitychange', () => { if (document.hidden) app.save(); });
  setInterval(() => app.save(), 10000);
  setInterval(() => app.refresh(), 500);

  requestAnimationFrame(loop);
}

function employeeCardHtml(id) {
  return employeeCard({ state: app.state, mods: app.mods }, id);
}

let acc = 0;
let last = performance.now();
function loop(now) {
  const real = (now - last) / 1000;
  last = now;
  const wall = Date.now();
  const gap = (wall - (app.state.time.lastRealMs || wall)) / 1000;

  if (!app.state.time.paused) {
    if (gap > 5) {
      const summary = runOffline(app.state, wall);
      if (summary && summary.gameDays > 0.25) showOfflineSummary(summary);
      acc = 0;
    } else {
      acc += Math.min(real, 1);
      let guard = 0;
      while (acc >= LIVE_STEP_SECONDS && guard++ < 40) {
        step(app.state, LIVE_STEP_SECONDS / REAL_SECONDS_PER_DAY, app.log);
        acc -= LIVE_STEP_SECONDS;
      }
      app.state.time.lastRealMs = wall;
    }
  } else {
    app.state.time.lastRealMs = wall;
  }
  requestAnimationFrame(loop);
}

function showOfflineSummary(s) {
  const rows = [
    ['Time away', fmtDuration(s.gameDays) + (s.capped ? ` (capped at ${OFFLINE_CAP_HOURS}h)` : '')],
    ['Revenue', money(s.revenue)],
    ['Expenses', money(s.expenses)],
    ['Net cash', money(s.cash)],
    ['Users', `${s.users >= 0 ? '+' : ''}${abbrev(s.users)}`],
    ['Paying customers', `${s.customers >= 0 ? '+' : ''}${abbrev(s.customers)}`],
    ['Team', `${s.employees >= 0 ? '+' : ''}${s.employees}`]
  ];
  app.ui.showOverlay(`<h2>While you were away</h2>
    <table><tbody>${rows.map(([k, v]) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`).join('')}</tbody></table>
    ${s.stageChanged ? `<p style="color:var(--accent)">The company reached the ${stageById(s.stageChanged).name} stage.</p>` : ''}
    ${s.projects.length ? `<p class="small">Shipped: ${s.projects.map((p) => p.split(':')[1]).slice(0, 6).join(', ')}</p>` : ''}
    ${s.entries.length ? `<h3>Notable</h3><ul class="small">${s.entries.map((e) => `<li>${e.text}</li>`).join('')}</ul>` : ''}
    <p class="muted small">Everything above is already banked. Nothing is waiting to be collected.</p>
    <div class="row"><button class="btn" data-act="close-overlay">Back to work</button></div>`);
}

boot();
