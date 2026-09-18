import { money, abbrev, pct, fmtDuration, clamp, uid } from '../sim/util.js';
import { stageById } from '../data/stages.js';
import { eventById } from '../data/events.js';
import { PANELS, PANEL_TITLES, employeeCard, prestige } from './panels.js';
import { eventText, choiceCost, resolveEvent } from '../sim/events.js';
import { hire, fire, promote, reassign, setManager } from '../sim/workforce.js';
import { queueProject, createProduct } from '../sim/products.js';
import { startResearch, cancelResearch } from '../sim/research.js';
import { raise } from '../sim/funding.js';
import { upgradeOffice, buyRoom } from '../sim/office.js';
import { acquire } from '../sim/competitors.js';
import { setCapacity, computeLoad } from '../sim/infra.js';
import { performExit } from '../sim/prestige.js';
import { buyPrestige } from '../sim/prestige.js';
import { addBoost } from '../sim/modifiers.js';
import { startRoadmap, cancelRoadmap, ensureRoadmap } from '../sim/roadmap.js';
import { hireAdvisor, dismissAdvisor } from '../sim/advisors.js';
import { acquireCompany } from '../sim/acquisitions.js';
import { acceptGoal, abandonGoal } from '../sim/goals.js';
import { playMinigame, MINIGAMES } from '../minigames/index.js';

const $ = (sel) => document.querySelector(sel);

/** Panels in keyboard order: 1-9 then 0. */
export const PANEL_ORDER = ['company', 'products', 'employees', 'departments', 'research',
  'finance', 'office', 'competitors', 'advisors', 'goals'];

// A purchase is refused if the same control is triggered again inside this
// window. A double click is one interaction; it must buy one level.
const REPEAT_GUARD_MS = 450;
const PURCHASE_ACTIONS = new Set(['buy-prestige', 'room', 'office', 'new-product', 'research',
  'raise', 'acquire', 'acquire-company', 'advisor-hire', 'roadmap-start', 'hire']);

export function createUI(app) {
  const els = {
    company: $('#company-name'), stage: $('#stage-chip'), stats: $('#stats'),
    events: $('#events'), feed: $('#feed'), tabs: $('#tabs'),
    drawer: $('#drawer'), drawerTitle: $('#drawer-title'), drawerBody: $('#drawer-body'),
    overlay: $('#overlay'), overlayCard: $('#overlay-card'), pause: $('#btn-pause')
  };
  let openPanel = null;
  let lastEventSig = '';
  let lastPanelHtml = '';

  const ctx = () => ({ state: app.state, mods: app.mods });

  // ------------------------------------------------------------- feed
  function pushFeed(text, kind = 'info') {
    const li = document.createElement('li');
    li.className = kind;
    li.innerHTML = `<span class="tag">${kind === 'good' ? '+' : kind === 'bad' ? '!' : kind === 'stage' || kind === 'goal' ? '★' : kind === 'event' ? '◆' : '·'}</span><span>${escapeHtml(text)}</span>`;
    els.feed.prepend(li);
    while (els.feed.children.length > 80) els.feed.lastChild.remove();
  }

  // ----------------------------------------------------------- top bar
  function renderTop() {
    const s = app.state;
    const st = s.stats;
    els.company.textContent = s.company.name;
    els.stage.textContent = stageById(s.company.stage).name;
    const runway = st.netDay >= 0 ? '∞' : fmtDuration(Math.max(0, st.runwayDays));
    const items = [
      ['Cash', money(s.company.cash), s.company.cash > 0 ? 'flat' : 'down'],
      ['Revenue', `${money(st.revenueDay)}/d`, 'up'],
      ['Burn', `${money(st.expenseDay)}/d`, 'down'],
      ['Net', `${money(st.netDay)}/d`, st.netDay >= 0 ? 'up' : 'down'],
      ['Runway', runway, st.netDay >= 0 ? 'up' : st.runwayDays < 30 ? 'down' : 'flat'],
      ['Users', abbrev(st.users), 'flat'],
      ['Customers', abbrev(st.customers), 'flat'],
      ['Team', String(s.employees.length), 'flat'],
      ['Valuation', money(st.valuation), 'flat'],
      ['Day', String(Math.floor(s.time.day)), 'flat']
    ];
    els.stats.innerHTML = items.map(([k, v, cls]) =>
      `<div class="stat"><dt>${k}</dt><dd class="${cls}">${v}</dd></div>`).join('');
    els.pause.textContent = s.time.paused ? 'Resume' : 'Pause';
    els.pause.setAttribute('aria-pressed', String(s.time.paused));
    if (s.exitResult) {
      els.pause.disabled = true;
      els.stage.textContent = 'Run ended';
    } else {
      els.pause.disabled = false;
    }
  }

  // ------------------------------------------------------------ events
  function renderEvents() {
    const s = app.state;
    const sig = s.events.pending.map((p) => p.id).join(',');
    if (sig === lastEventSig) return;
    lastEventSig = sig;
    if (!s.events.pending.length) {
      els.events.innerHTML = '<p class="muted small">Nothing needs you right now. Anything that arrives and is ignored resolves the safe way on its own.</p>';
      updateBadges();
      return;
    }
    els.events.innerHTML = s.events.pending.map((p) => {
      const def = eventById(p.eventId);
      const left = Math.max(0, p.expiresDay - s.time.day);
      return `<div class="tile event-card">
        <h3>${escapeHtml(def.title)}<span class="tag">${fmtDuration(left)} left</span></h3>
        <p>${escapeHtml(eventText(s, p))}</p>
        ${def.choices.map((c) => {
          const cost = choiceCost(s, c);
          const poor = cost > s.company.cash;
          return `<button class="choice" data-act="event" data-id="${p.id}|${c.id}"${poor ? ' disabled' : ''}>
            <b>${escapeHtml(c.label)}${cost ? ` — ${money(cost)}` : ''}${c.minigame ? ' ▶' : ''}</b>
            ${escapeHtml(c.desc || (c.minigame ? MINIGAMES[c.minigame].blurb : ''))}${poor ? ' (not enough cash)' : ''}</button>`;
        }).join('')}
      </div>`;
    }).join('');
    updateBadges();
  }

  function updateBadges() {
    const n = app.state.events.pending.length;
    for (const b of els.tabs.querySelectorAll('button')) {
      b.setAttribute('aria-current', String(b.dataset.panel === openPanel));
    }
    document.title = n ? `(${n}) Startup Tycoon` : 'Startup Tycoon';
  }

  // ------------------------------------------------------------ panels
  function renderPanel(force = false) {
    if (!openPanel) return;
    const html = PANELS[openPanel](ctx());
    if (!force && html === lastPanelHtml) return;
    lastPanelHtml = html;
    const scroll = els.drawerBody.scrollTop;
    els.drawerBody.innerHTML = html;
    els.drawerBody.scrollTop = scroll;
  }

  function showPanel(name) {
    if (openPanel === name) return hidePanel();
    openPanel = name;
    els.drawerTitle.textContent = PANEL_TITLES[name];
    els.drawer.hidden = false;
    lastPanelHtml = '';
    renderPanel(true);
    els.drawerBody.focus();
    updateBadges();
  }

  function hidePanel() {
    openPanel = null;
    els.drawer.hidden = true;
    updateBadges();
  }

  function showOverlay(html) {
    els.overlayCard.innerHTML = html;
    els.overlay.hidden = false;
    els.overlayCard.querySelector('button, input, select')?.focus();
  }
  function hideOverlay() { els.overlay.hidden = true; els.overlayCard.innerHTML = ''; }

  // ----------------------------------------------------------- actions
  const lastAt = new Map();
  /** True when this control fired again too soon to be a fresh decision. */
  function isRepeat(key) {
    const now = Date.now();
    const prev = lastAt.get(key) || 0;
    lastAt.set(key, now);
    return now - prev < REPEAT_GUARD_MS;
  }

  async function dispatch(act, id, el) {
    const s = app.state;
    const mods = app.mods;
    // One interaction, one transaction: a second trigger of the same purchase
    // inside the guard window does nothing at all.
    if (PURCHASE_ACTIONS.has(act) && isRepeat(`${act}:${id}`)) {
      app.notify('Already in progress.', 'bad');
      return;
    }
    const done = (r, okMsg) => {
      if (r && r.ok === false) app.notify(r.reason || 'That did not work.', 'bad');
      else if (okMsg) app.notify(okMsg, 'good');
      app.refresh();
      renderPanel(true);
      renderEvents();
    };

    switch (act) {
      case 'event': {
        const [pid, cid] = id.split('|');
        const pending = s.events.pending.find((p) => p.id === pid);
        const def = pending && eventById(pending.eventId);
        const choice = def?.choices.find((c) => c.id === cid);
        if (!pending || !choice) { done({ ok: false, reason: 'That event has already been resolved.' }); break; }
        if (choice?.minigame) {
          const score = await runMinigame(choice.minigame);
          applyMinigameReward(s, mods, choice.minigame, score, pending);
          const fallback = def.choices.find((c) => !c.minigame && choiceCost(s, c) <= s.company.cash) || def.choices[0];
          done(resolveEvent(s, mods, pid, fallback.id, app.log));
        } else {
          done(resolveEvent(s, mods, pid, cid, app.log));
        }
        break;
      }
      case 'hire': done(hire(s, id, mods), 'Hired.'); break;
      case 'fire': {
        const e = s.employees.find((x) => x.id === id);
        if (!confirm(`Let ${e?.name} go? Severance is one month of salary and the team will notice.`)) return;
        done(fire(s, id)); hideOverlay(); break;
      }
      case 'promote': done(promote(s, id)); break;
      case 'give-raise': {
        const e = s.employees.find((x) => x.id === id);
        if (e) { e.salary = Math.round(e.salary * 1.1); e.morale = clamp(e.morale + 0.12, 0, 1.1); }
        showOverlay(employeeCard(ctx(), id)); done(null); break;
      }
      case 'reassign-select': done(reassign(s, id, el.value)); break;
      case 'employee': showOverlay(employeeCard(ctx(), id)); break;
      case 'close-overlay': hideOverlay(); break;
      case 'queue': { const [pid, tid] = id.split('|'); done(queueProject(s, mods, pid, tid)); break; }
      case 'priority': {
        const p = s.products.find((x) => x.id === id);
        if (p) p.priority = Number(el.dataset.val);
        done(null); break;
      }
      case 'new-product': done(createProduct(s, mods, id), 'New product started.'); break;
      case 'priority-dept': { const [d, p] = id.split('|'); s.departments[d].priority = p; done(null); break; }
      case 'set-manager': done(setManager(s, id, el.value)); break;
      case 'research': done(startResearch(s, mods, id), 'Research started.'); break;
      case 'cancel-research': done(cancelResearch(s, id)); break;
      case 'marketing-set': {
        const map = { '0': 0, r10: 0.10, r25: 0.25, r40: 0.40 };
        s.company.marketingBudget = id === '0' ? 0 : Math.round(s.stats.revenueDay * map[id]);
        done(null); break;
      }
      case 'capacity': {
        if (id === 'auto') setCapacity(s, Math.ceil(computeLoad(s) / 0.7));
        else setCapacity(s, s.infra.capacity + Number(id));
        done(null); break;
      }
      case 'raise': done(raise(s, mods, id), 'Round closed.'); break;
      case 'office': done(upgradeOffice(s), 'New office. Everyone is moving desks.'); break;
      case 'room': done(buyRoom(s, id), 'Built.'); break;
      case 'acquire': done(acquire(s, mods, id), 'Acquisition complete.'); break;
      case 'acquire-company': {
        const r = acquireCompany(s, mods, id);
        done(r, r.ok ? `Bought ${r.target.name}. ${r.hires} people joined, integration has started.` : null);
        break;
      }
      case 'roadmap-start': {
        const [pid, iid] = id.split('|');
        const r = startRoadmap(s, mods, pid, iid);
        done(r, r.ok ? `Roadmap set: ${r.initiative.name}.` : null);
        break;
      }
      case 'roadmap-cancel': done(cancelRoadmap(s, id)); break;
      case 'roadmap-auto': {
        const p = s.products.find((x) => x.id === id);
        if (!p) { done({ ok: false, reason: 'Unknown product.' }); break; }
        const rm = ensureRoadmap(p);
        rm.auto = !rm.auto;
        done(null, rm.auto
          ? 'Your engineering manager will plan conservative initiatives.'
          : 'You are planning this roadmap yourself.');
        break;
      }
      case 'advisor-hire': {
        const r = hireAdvisor(s, id);
        done(r, r.ok ? `${r.advisor.name} is retained.` : null);
        break;
      }
      case 'advisor-dismiss': done(dismissAdvisor(s, id)); break;
      case 'goal-accept': {
        const r = acceptGoal(s, id);
        done(r, r.ok ? `Goal accepted: ${r.goal.name}.` : null);
        break;
      }
      case 'goal-abandon': done(abandonGoal(s)); break;
      case 'open-prestige': showOverlay(prestige(ctx())); break;
      case 'buy-prestige': {
        // Every purchase carries a transaction id. Two clicks on the same
        // rendered control share it, so the second cannot buy a second level.
        const txId = el.dataset.txid || (el.dataset.txid = uid('tx'));
        const r = buyPrestige(s.meta, id, { txId });
        showOverlay(prestige(ctx()));
        done(r, r.ok ? `${id.replace(/_/g, ' ')} is now level ${r.level}.` : null);
        break;
      }
      case 'exit': app.onExit(id); break;
      case 'exit-summary': app.showExitSummary(); break;
      case 'save-now': app.save(); app.notify('Saved.', 'good'); break;
      case 'export': app.exportSave(); break;
      case 'import': app.importSave(); break;
      case 'reset': app.resetGame(); break;
      default: break;
    }
  }

  async function runMinigame(type) {
    return new Promise((resolve) => {
      els.overlay.hidden = false;
      playMinigame(type, els.overlayCard).then((score) => {
        els.overlayCard.innerHTML = `<h2>${MINIGAMES[type].name}</h2>
          <p>Result: <b>${Math.round(score * 100)}%</b></p>
          <p class="muted small">${score > 0.8 ? 'Excellent. The bonus is substantial.' : score > 0.4 ? 'Solid work.' : 'Not your best. A small bonus all the same.'}</p>
          <button class="btn" data-act="close-overlay">Back to the office</button>`;
        setTimeout(() => { hideOverlay(); resolve(score); }, 900);
      });
    });
  }

  // ------------------------------------------------------------- wiring
  els.tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-panel]');
    if (b) showPanel(b.dataset.panel);
  });
  $('#drawer-close').addEventListener('click', hidePanel);
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    e.preventDefault();
    dispatch(el.dataset.act, el.dataset.id || '', el);
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    if (el.tagName === 'SELECT') dispatch(el.dataset.act, el.dataset.id || '', el);
  });
  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-act="marketing"]');
    if (!el) return;
    app.state.company.marketingBudget = Number(el.value);
    const label = el.parentElement.querySelector('.spread span');
    if (label) label.textContent = `${money(Number(el.value))}/day`;
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.key === 'Escape') { if (!els.overlay.hidden) hideOverlay(); else hidePanel(); }
    if (e.code === 'Space' && els.overlay.hidden) { e.preventDefault(); app.togglePause(); }
    const n = e.key === '0' ? 10 : Number(e.key);
    if (n >= 1 && n <= PANEL_ORDER.length && els.overlay.hidden) showPanel(PANEL_ORDER[n - 1]);
    if (e.key === '?') app.showHelp();
  });

  return {
    render() { renderTop(); renderEvents(); renderPanel(); },
    renderPanelNow() { renderPanel(true); },
    pushFeed, showOverlay, hideOverlay, showPanel, hidePanel,
    get openPanel() { return openPanel; }
  };
}

export function applyMinigameReward(state, mods, type, score, pending) {
  const s = clamp(score, 0, 1);
  if (type === 'debugging') {
    addBoost(state, 'mg_debug', { devSpeed: 0.15 + 0.35 * s, quality: 0.05 * s }, 4 + 4 * s, 'Debugging streak');
    const p = state.products.find((x) => x.projects.length);
    if (p) p.projects[0].done = Math.min(p.projects[0].work, p.projects[0].done + p.projects[0].work * 0.12 * s);
  } else if (type === 'incident') {
    for (const p of state.products) if (p.outage > 0) p.outage *= (1 - 0.85 * s);
    state.infra.reliability = clamp(state.infra.reliability + 0.04 * s, 0, 0.999);
    addBoost(state, 'mg_incident', { outageRisk: -0.3 * s }, 10, 'Incident learnings');
  } else if (type === 'negotiation') {
    addBoost(state, 'mg_negotiation', { contractSize: 0.15 + 0.5 * s, sales: 0.12 * s }, 12, 'Negotiation momentum');
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
