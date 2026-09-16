import { money, abbrev, pct, fmtDuration, clamp } from '../sim/util.js';
import { STAGES, stageById, stageOrder } from '../data/stages.js';
import { DEPARTMENTS, departmentById, roleById, ROLES } from '../data/roles.js';
import { PROJECT_TYPES, categoryById, CUSTOMER_CLASSES } from '../data/products.js';
import { RESEARCH, RESEARCH_CATEGORIES, researchById } from '../data/research.js';
import { OFFICE_TIERS, ROOMS } from '../data/office.js';
import { PRESTIGE_UPGRADES } from '../data/prestige.js';
import {
  liveProducts, totalCustomers, marketCap, projectAvailable, suggestProject, maxProducts,
  availableCategories, productCost, classMix
} from '../sim/products.js';
import { stageProgress } from '../sim/stages.js';
import { computeWorkforce, deskPressure, marketSalary, prioritySplit, hireCost } from '../sim/workforce.js';
import { researchStatus, researchSlots } from '../sim/research.js';
import { fundingOffers } from '../sim/funding.js';
import { exitPreview, prestigeLevels } from '../sim/prestige.js';
import { officeOptions, roomOptions } from '../sim/office.js';
import { acquisitionTargets, marketShares } from '../sim/competitors.js';
import { effectiveCapacity, UNIT_COST_DAY } from '../sim/infra.js';
import { has } from '../sim/modifiers.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const bar = (v, cls = '', label = '') =>
  `<div class="bar ${cls}"${label ? ` role="img" aria-label="${esc(label)}"` : ''}><i style="width:${clamp(v, 0, 1) * 100}%"></i></div>`;
const btn = (act, label, { id = '', cls = 'btn', disabled = false, title = '' } = {}) =>
  `<button class="${cls}" data-act="${act}"${id ? ` data-id="${esc(id)}"` : ''}${disabled ? ' disabled' : ''}${title ? ` title="${esc(title)}"` : ''}>${esc(label)}</button>`;

export const PANEL_TITLES = {
  company: 'Company', products: 'Products', employees: 'Employees', departments: 'Departments',
  research: 'Research', finance: 'Finance', office: 'Office', competitors: 'Competitors'
};

// ---------------------------------------------------------------- Company
export function company(ctx) {
  const { state, mods } = ctx;
  const c = state.company;
  const prog = stageProgress(state);
  const exits = exitPreview(state, mods);
  const meta = state.meta;

  const stageList = STAGES.map((s) => {
    const done = stageOrder(c.stage) >= s.order;
    const cur = c.stage === s.id;
    return `<tr${cur ? ' style="color:var(--accent)"' : ''}>
      <td>${done ? '✔' : '·'}</td><td>${esc(s.name)}</td>
      <td class="small muted">${esc(s.blurb)}</td></tr>`;
  }).join('');

  const progressHtml = prog ? `
    <div class="tile">
      <h3>Next stage: ${esc(prog.stage.name)}<span class="tag">${Math.round(prog.pct * 100)}%</span></h3>
      ${prog.parts.map((p) => `
        <div class="spread small"><span>${esc(labelFor(p.key))}</span>
          <span>${fmtReq(p.key, p.have)} / ${fmtReq(p.key, p.need)}</span></div>
        ${bar(p.pct, p.pct >= 1 ? 'good' : '', `${labelFor(p.key)} progress`)}`).join('')}
    </div>` : '<div class="tile"><h3>Late Stage</h3><p>There is nothing left to grow into. Time to decide how this ends.</p></div>';

  const exitHtml = exits.some((e) => e.available) ? `
    <h3>Exit</h3>
    <p class="muted small">Ending the run converts your stake into Founder Reputation, which is permanent.</p>
    <div class="grid two">${exits.map((e) => `
      <div class="tile">
        <h3>${esc(e.name)}<span class="tag">${e.rep} FR</span></h3>
        <p>${esc(e.blurb)}</p>
        <div class="spread small"><span>Company value</span><b>${money(e.value)}</b></div>
        <div class="spread small"><span>Your ${pct(state.company.founderEquity)} stake</span><b>${money(e.proceeds)}</b></div>
        ${btn('exit', e.available ? `Take the ${e.name}` : e.reason || 'Unavailable', { id: e.id, disabled: !e.available })}
      </div>`).join('')}</div><hr />` : '';

  return `
    <div class="grid two">
      <div class="tile">
        <h3>${esc(c.name)}<span class="tag">${esc(stageById(c.stage).name)}</span></h3>
        <div class="spread small"><span>Founded</span><b>day ${Math.floor(state.time.day)}</b></div>
        <div class="spread small"><span>Reputation</span><b>${c.reputation.toFixed(2)}</b></div>
        <div class="spread small"><span>Your equity</span><b>${pct(c.founderEquity, 1)}</b></div>
        <div class="spread small"><span>Raised</span><b>${money(c.totalRaised)}</b></div>
        <div class="spread small"><span>Valuation</span><b>${money(state.stats.valuation)}</b></div>
        <div class="spread small"><span>Lifetime revenue</span><b>${money(c.lifetimeRevenue)}</b></div>
      </div>
      ${progressHtml}
    </div>
    <hr />
    ${exitHtml}
    <h3>Company stages</h3>
    <table><tbody>${stageList}</tbody></table>
    <hr />
    <h3>Founder progress</h3>
    <div class="spread"><span>Founder Reputation</span><b>${meta.founderRep} unspent · ${meta.lifetimeRep} earned</b></div>
    <p class="muted small">Previous runs: ${meta.runs.length}${meta.runs.length ? ` · best exit ${money(Math.max(...meta.runs.map((r) => r.proceeds)))}` : ''}</p>
    ${meta.runs.length ? `<table><thead><tr><th>Company</th><th>Exit</th><th class="num">Proceeds</th><th class="num">FR</th><th class="num">Days</th></tr></thead><tbody>
      ${meta.runs.slice(0, 8).map((r) => `<tr><td>${esc(r.company)}</td><td>${esc(r.exit)}</td><td class="num">${money(r.proceeds)}</td><td class="num">${r.rep}</td><td class="num">${r.days}</td></tr>`).join('')}
    </tbody></table>` : ''}
    ${btn('open-prestige', 'Founder upgrades', { cls: 'btn secondary' })}
    <hr />
    <h3>Save</h3>
    <div class="row">
      ${btn('save-now', 'Save now', { cls: 'btn secondary' })}
      ${btn('export', 'Export save', { cls: 'btn secondary' })}
      ${btn('import', 'Import save', { cls: 'btn secondary' })}
      ${btn('reset', 'Reset company', { cls: 'btn danger' })}
    </div>
    <p class="muted small">Autosaves every 10 seconds and when you close the tab. Offline progress is credited up to 16 hours.</p>`;
}

const labelFor = (k) => ({ employees: 'Employees', revenueDay: 'Revenue per day', productsLive: 'Products live', valuation: 'Valuation' }[k] || k);
const fmtReq = (k, v) => (k === 'revenueDay' || k === 'valuation' ? money(v) : Math.floor(v));

// --------------------------------------------------------------- Products
export function products(ctx) {
  const { state, mods } = ctx;
  const cats = availableCategories(state, mods);
  const slots = maxProducts(state);

  const cards = state.products.map((p) => {
    const cat = categoryById(p.category);
    const cap = marketCap(state, mods, p);
    const cust = totalCustomers(p);
    const mix = classMix(state, mods, p);
    const cur = p.projects[0];
    const avail = PROJECT_TYPES.filter((t) => projectAvailable(state, mods, p, t));
    const rec = suggestProject(state, mods, p);
    return `
      <div class="tile">
        <h3>${esc(p.name)} <span class="tag">${esc(cat.name)}</span>
          <span class="tag">v${p.version.toFixed(1)}</span>${p.outage > 0 ? '<span class="tag" style="color:var(--bad);border-color:var(--bad)">OUTAGE</span>' : ''}</h3>
        <p>${esc(cat.blurb)}</p>
        ${p.stage === 'development' ? '<p class="muted">In development - no users yet.</p>' : `
          <div class="spread small"><span>Users</span><b>${abbrev(p.users)} / ${abbrev(cap)} market</b></div>
          ${bar(p.users / Math.max(cap, 1), 'good', 'market penetration')}
          <div class="spread small"><span>Paying customers</span><b>${abbrev(cust)}</b></div>
          <div class="spread small"><span>Revenue</span><b>${money(p.revenueDay)}/day</b></div>
          <div class="spread small"><span>Churn</span><b>${(p.churnDay * 100).toFixed(2)}%/day</b></div>
          <div class="spread small"><span>Net growth</span><b class="${p.growthDay >= 0 ? 'up' : 'down'}">${p.growthDay >= 0 ? '+' : ''}${abbrev(p.growthDay)}/day</b></div>
          <div class="small muted">Mix: ${CUSTOMER_CLASSES.filter((k) => mix[k] > 0.01).map((k) => `${k} ${Math.round(mix[k] * 100)}%`).join(' · ')}</div>`}
        <hr />
        <div class="spread small"><span>Quality</span><span>${pct(p.quality)}</span></div>${bar(p.quality, 'good')}
        <div class="spread small"><span>Reliability</span><span>${pct(p.reliability)}</span></div>${bar(p.reliability, p.reliability > 0.8 ? 'good' : 'warn')}
        <div class="spread small"><span>Technical debt</span><span>${pct(p.techDebt / 2)}</span></div>${bar(p.techDebt / 2, p.techDebt > 0.5 ? 'bad' : 'warn')}
        <div class="spread small"><span>Enterprise readiness</span><span>${pct(p.enterpriseReady)}</span></div>${bar(p.enterpriseReady)}
        <hr />
        <div class="spread small"><span>Priority</span>
          <span class="row">
            ${[['0.5', 'Low'], ['1', 'Normal'], ['2', 'High']].map(([v, l]) =>
              `<button class="ghost" data-act="priority" data-id="${p.id}" data-val="${v}"${String(p.priority) === v ? ' aria-current="true" style="color:var(--accent);border-color:var(--accent)"' : ''}>${l}</button>`).join('')}
          </span></div>
        <h3 style="margin-top:10px">Work queue</h3>
        ${cur ? `<div class="spread small"><span>${esc(cur.name)}</span><span>${Math.round((cur.done / cur.work) * 100)}%</span></div>${bar(cur.done / cur.work)}` : '<p class="muted small">Idle. Queue something below, or hire an engineering manager to keep it busy.</p>'}
        ${p.projects.slice(1).map((q) => `<div class="small muted">queued: ${esc(q.name)}</div>`).join('')}
        <div class="row" style="margin-top:8px">
          ${avail.map((t) => btn('queue', `${t.name}${rec && rec.id === t.id ? ' ★' : ''}`, {
            id: `${p.id}|${t.id}`, cls: 'btn secondary',
            disabled: p.projects.length >= 4,
            title: `${t.desc} (~${Math.round(cat.mvpWork * t.workMul * (1 + p.completed.length * 0.09))} work)`
          })).join('')}
        </div>
      </div>`;
  }).join('');

  const newProducts = state.products.length < slots ? `
    <h3>Start a new product <span class="tag">${state.products.length}/${slots} slots</span></h3>
    <div class="grid two">${cats.map((c) => `
      <div class="tile">
        <h3>${esc(c.name)}<span class="tag">${money(c.cost)}</span></h3>
        <p>${esc(c.blurb)}</p>
        <div class="small muted">Market ${abbrev(c.marketBase)} · churn ${(c.churn * 100).toFixed(1)}%/day · infra ${c.infraLoad}/1k users · enterprise ${pct(c.enterprisePotential)}</div>
        ${btn('new-product', c.available ? `Start ${c.name}` : c.reason || 'Unavailable', { id: c.id, disabled: !c.available })}
      </div>`).join('')}</div><hr />` : `<p class="muted small">Product slots full (${state.products.length}/${slots}). Reaching the next company stage opens another.</p><hr />`;

  return newProducts + `<div class="grid two">${cards}</div>`;
}

// -------------------------------------------------------------- Employees
export function employees(ctx) {
  const { state, mods } = ctx;
  const wf = computeWorkforce(state, mods);
  const { capacity } = deskPressure(state, mods);

  const cands = state.candidates.length ? state.candidates.map((c) => {
    const role = roleById(c.role);
    return `<tr>
      <td>${esc(c.name)}${c.star ? ' <span class="tag" style="color:var(--accent)">star</span>' : ''}</td>
      <td>${esc(role.name)}</td>
      <td class="num">${c.skill.toFixed(1)}</td>
      <td class="num">${c.productivity.toFixed(2)}</td>
      <td class="num">${money(c.salary, 0)}/yr</td>
      <td class="num">${c.signingBonus ? money(c.signingBonus, 0) : '-'}</td>
      <td>${esc(c.specialty ? c.specialty : '-')}</td>
      <td>${btn('hire', 'Hire', { id: c.id, cls: 'btn', disabled: state.employees.length >= capacity || state.company.cash < c.signingBonus })}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" class="muted">No candidates right now. More arrive every few days.</td></tr>';

  const roster = state.employees.slice().sort((a, b) => b.skill - a.skill).map((e) => {
    const role = roleById(e.role);
    return `<tr>
      <td><button class="ghost" data-act="employee" data-id="${e.id}" style="padding:2px 6px">${esc(e.name)}</button></td>
      <td>${esc(role.name)}</td>
      <td>${esc(departmentById(e.dept)?.name || e.dept)}</td>
      <td class="num">${e.skill.toFixed(1)}</td>
      <td class="num">${e.productivity.toFixed(2)}</td>
      <td class="num">${e.salary ? money(e.salary, 0) : '-'}</td>
      <td style="min-width:70px">${bar(e.morale, e.morale > 0.6 ? 'good' : e.morale > 0.4 ? 'warn' : 'bad', `${e.name} morale`)}</td>
      <td>${e.isManager ? '<span class="tag">manager</span>' : ''}${e.specialty ? `<span class="tag">${esc(e.specialty)}</span>` : ''}</td>
    </tr>`;
  }).join('');

  return `
    <div class="grid two">
      <div class="tile"><h3>Headcount</h3>
        <div class="spread"><span>${state.employees.length} / ${capacity} desks</span><b>${money(wf.payrollDay)}/day</b></div>
        ${bar(state.employees.length / Math.max(capacity, 1), state.employees.length > capacity ? 'bad' : 'good', 'desk usage')}
        <p class="muted small">${state.employees.length > capacity ? 'Overcrowded: morale and output are suffering.' : 'Everyone has somewhere to sit.'}</p>
      </div>
      <div class="tile"><h3>Output per day</h3>
        ${['eng', 'product', 'design', 'sales', 'marketing', 'support', 'infra'].map((k) =>
          `<div class="spread small"><span>${k}</span><b>${wf.out[k].toFixed(1)}</b></div>`).join('')}
      </div>
    </div>
    <hr />
    <h3>Candidates</h3>
    <table><thead><tr><th>Name</th><th>Role</th><th class="num">Skill</th><th class="num">Prod</th><th class="num">Salary</th><th class="num">Bonus</th><th>Specialty</th><th></th></tr></thead>
    <tbody>${cands}</tbody></table>
    <hr />
    <h3>Team</h3>
    <table><thead><tr><th>Name</th><th>Role</th><th>Department</th><th class="num">Skill</th><th class="num">Prod</th><th class="num">Salary</th><th>Morale</th><th></th></tr></thead>
    <tbody>${roster}</tbody></table>`;
}

export function employeeCard(ctx, id) {
  const { state } = ctx;
  const e = state.employees.find((x) => x.id === id);
  if (!e) return '<p>That person has left the company.</p>';
  const role = roleById(e.role);
  const under = e.salary > 0 && e.salary < marketSalary(e.role, e.skill) * 0.92;
  return `
    <h2>${esc(e.name)}</h2>
    <p class="muted">${esc(role.name)} · ${esc(departmentById(e.dept)?.name || e.dept)}${e.specialty ? ` · ${esc(e.specialty)}` : ''}</p>
    <p class="small">${esc(role.blurb)}</p>
    <div class="spread small"><span>Skill</span><b>${e.skill.toFixed(1)} / 12</b></div>${bar(e.skill / 12)}
    <div class="spread small"><span>Productivity</span><b>${e.productivity.toFixed(2)}x</b></div>${bar(e.productivity / 1.5)}
    <div class="spread small"><span>Morale</span><b>${pct(e.morale)}</b></div>${bar(e.morale, e.morale > 0.6 ? 'good' : 'warn')}
    <div class="spread small"><span>Salary</span><b>${e.salary ? `${money(e.salary, 0)}/yr` : 'none (founder)'}</b></div>
    ${under ? '<p class="small" style="color:var(--warn)">Paid below market. They are a flight risk.</p>' : ''}
    <div class="spread small"><span>Experience</span><b>${e.experience.toFixed(1)}</b></div>
    <div class="spread small"><span>Current work</span><b>${esc(currentTask(state, e))}</b></div>
    <hr />
    <div class="row">
      <label class="small">Department
        <select data-act="reassign-select" data-id="${e.id}">
          ${DEPARTMENTS.map((d) => `<option value="${d.id}"${d.id === e.dept ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="row" style="margin-top:10px">
      ${btn('promote', 'Promote', { id: e.id, cls: 'btn secondary' })}
      ${btn('give-raise', 'Give a 10% raise', { id: e.id, cls: 'btn secondary' })}
      ${e.id === 'founder' ? '' : btn('fire', 'Let go', { id: e.id, cls: 'btn danger' })}
      ${btn('close-overlay', 'Close', { cls: 'btn secondary' })}
    </div>`;
}

function currentTask(state, e) {
  if (e.dept === 'engineering') {
    const p = state.products.find((x) => x.projects.length);
    return p ? `${p.projects[0].name} on ${p.name}` : 'No queued work';
  }
  const d = departmentById(e.dept);
  const pri = state.departments[e.dept]?.priority;
  return `${d.name} · ${d.priorities.find((x) => x.id === pri)?.name || 'Balanced'}`;
}

// ------------------------------------------------------------ Departments
export function departments(ctx) {
  const { state, mods } = ctx;
  const wf = computeWorkforce(state, mods);
  const order = stageOrder(state.company.stage);
  const managers = state.employees.filter((e) => e.isManager);

  return `<p class="muted small">Priorities change what a department spends its effort on. Managers unlock automation: an engineering manager keeps the top product's queue full on its own, and the Delivery Playbooks research extends that to every product.</p>
  <div class="grid two">${DEPARTMENTS.map((d) => {
    const locked = order < stageOrder(d.unlock);
    const dept = state.departments[d.id];
    const staff = state.employees.filter((e) => e.dept === d.id);
    const mgr = state.employees.find((e) => e.id === dept.managerId);
    if (locked) return `<div class="tile"><h3>${esc(d.name)}<span class="tag">locked</span></h3><p>Unlocks at the ${esc(d.unlock)} stage.</p></div>`;
    return `
      <div class="tile">
        <h3>${esc(d.name)}<span class="tag">${staff.length} people</span></h3>
        <p>${esc(d.blurb)}</p>
        <div class="spread small"><span>Output</span><b>${Object.entries(wf.byDept[d.id]).filter(([, v]) => v > 0.05).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' · ') || 'none'}</b></div>
        <div class="spread small"><span>Manager</span><b>${mgr ? esc(mgr.name) : 'none'}</b></div>
        <label class="small">Assign manager
          <select data-act="set-manager" data-id="${d.id}">
            <option value="">- none -</option>
            ${managers.map((m) => `<option value="${m.id}"${m.id === dept.managerId ? ' selected' : ''}>${esc(m.name)} (skill ${m.skill.toFixed(1)})</option>`).join('')}
          </select></label>
        <div style="margin-top:8px">
          ${d.priorities.map((p) => `<button class="choice" data-act="priority-dept" data-id="${d.id}|${p.id}"${dept.priority === p.id ? ' style="border-color:var(--accent)"' : ''}>
            <b>${esc(p.name)}${dept.priority === p.id ? ' ✔' : ''}</b>${esc(p.desc)}</button>`).join('')}
        </div>
      </div>`;
  }).join('')}</div>`;
}

// ---------------------------------------------------------------- Research
export function research(ctx) {
  const { state, mods } = ctx;
  const slots = researchSlots(state, mods);
  const active = state.research.active.map((a) => {
    const r = researchById(a.id);
    return `<div class="tile"><h3>${esc(r.name)}<span class="tag">${fmtDuration(Math.max(0, a.required - a.progress))} left</span></h3>
      ${bar(a.progress / a.required)}
      ${btn('cancel-research', 'Cancel (40% refund)', { id: a.id, cls: 'btn secondary' })}</div>`;
  }).join('');

  const byCat = RESEARCH_CATEGORIES.map((cat) => {
    const items = RESEARCH.filter((r) => r.cat === cat.id).map((r) => {
      const s = researchStatus(state, mods, r.id);
      const done = s.state === 'done';
      return `<div class="tile" style="${done ? 'opacity:.6' : ''}">
        <h3>${esc(r.name)}<span class="tag">${done ? 'done' : money(r.cost)}</span></h3>
        <p>${esc(r.desc)}</p>
        <div class="small muted">${fmtDuration(r.days)} of research${r.req.length ? ` · after ${r.req.map((q) => researchById(q).name).join(', ')}` : ''}</div>
        ${done ? '' : btn('research', s.state === 'available' ? 'Start research' : (s.reason || labelState(s.state)), { id: r.id, disabled: s.state !== 'available', cls: 'btn secondary' })}
      </div>`;
    }).join('');
    return `<h3 style="margin-top:16px">${esc(cat.name)}</h3><div class="grid two">${items}</div>`;
  }).join('');

  return `
    <div class="spread"><span>Research slots in use</span><b>${state.research.active.length} / ${slots}</b></div>
    ${has(mods, 'research') ? '' : '<p class="muted">Research unlocks at the Seed stage.</p>'}
    <div class="grid two">${active}</div>
    ${byCat}`;
}
const labelState = (s) => ({ locked: 'Locked', unaffordable: 'Not enough cash', busy: 'All slots busy', active: 'In progress' }[s] || s);

// ---------------------------------------------------------------- Finance
export function finance(ctx) {
  const { state, mods } = ctx;
  const st = state.stats;
  const offers = fundingOffers(state, mods);
  const cap = effectiveCapacity(state, mods);
  const util = state.infra.load / Math.max(cap, 1);
  const lines = [
    ['Product revenue', liveProducts(state).reduce((a, p) => a + p.revenueDay, 0), 'up'],
    ['Contract revenue', state.contracts.reduce((a, c) => a + c.revenueDay, 0), 'up'],
    ['Payroll', -st.payrollDay, 'down'],
    ['Infrastructure', -st.infraDay, 'down'],
    ['Marketing', -st.marketingDay, 'down'],
    ['Rent', -st.rentDay, 'down'],
    ['Tools & overhead', -(st.miscDay || 0), 'down']
  ];

  return `
    <div class="grid two">
      <div class="tile"><h3>Cash flow</h3>
        <table><tbody>${lines.map(([l, v]) => `<tr><td>${l}</td><td class="num ${v >= 0 ? 'up' : 'down'}">${money(v)}/day</td></tr>`).join('')}
        <tr><td><b>Net</b></td><td class="num ${st.netDay >= 0 ? 'up' : 'down'}"><b>${money(st.netDay)}/day</b></td></tr></tbody></table>
        <div class="spread small" style="margin-top:8px"><span>Runway</span>
          <b>${st.netDay >= 0 ? 'profitable' : fmtDuration(Math.max(0, st.runwayDays))}</b></div>
      </div>
      <div class="tile"><h3>Marketing budget</h3>
        <p class="muted small">Spent every day across live products, weighted by priority. Diminishing returns past roughly 2% of a market per day.</p>
        <input type="range" min="0" max="${Math.max(1000, Math.round(Math.max(st.revenueDay * 2, state.company.cash / 20)))}"
          step="10" value="${Math.round(state.company.marketingBudget)}" data-act="marketing" aria-label="Marketing budget per day" />
        <div class="spread"><span>${money(state.company.marketingBudget)}/day</span>
          <span class="row">${btn('marketing-set', '0', { id: '0', cls: 'ghost' })}
          ${btn('marketing-set', '10% of revenue', { id: 'r10', cls: 'ghost' })}
          ${btn('marketing-set', '25%', { id: 'r25', cls: 'ghost' })}
          ${btn('marketing-set', '40%', { id: 'r40', cls: 'ghost' })}</span></div>
      </div>
    </div>
    <hr />
    <h3>Infrastructure</h3>
    <div class="grid two">
      <div class="tile">
        <div class="spread small"><span>Load / capacity</span><b>${state.infra.load.toFixed(1)} / ${cap.toFixed(0)} units</b></div>
        ${bar(util, util > 0.95 ? 'bad' : util > 0.8 ? 'warn' : 'good', 'utilisation')}
        <div class="spread small"><span>Reliability</span><b>${(state.infra.reliability * 100).toFixed(1)}%</b></div>
        <div class="spread small"><span>Cost</span><b>${money(state.infra.spendDay)}/day (${money(UNIT_COST_DAY, 2)}/unit)</b></div>
        ${state.infra.autoscale ? '<p class="small" style="color:var(--good)">Autoscaling is on. Capacity tracks load automatically.</p>' : `
          <div class="row" style="margin-top:8px">
            ${btn('capacity', '-10', { id: '-10', cls: 'btn secondary' })}
            ${btn('capacity', '-1', { id: '-1', cls: 'btn secondary' })}
            ${btn('capacity', '+1', { id: '1', cls: 'btn secondary' })}
            ${btn('capacity', '+10', { id: '10', cls: 'btn secondary' })}
            ${btn('capacity', 'Right-size', { id: 'auto', cls: 'btn' })}
          </div>`}
      </div>
      <div class="tile"><h3>Contracts</h3>
        ${state.contracts.length ? `<table><tbody>${state.contracts.map((c) => `<tr><td>${esc(c.name)}${c.sla ? ' <span class="tag">SLA</span>' : ''}</td><td class="num">${money(c.revenueDay)}/day</td><td class="num">${fmtDuration(c.remaining)}</td></tr>`).join('')}</tbody></table>`
          : '<p class="muted small">No enterprise contracts yet. They arrive as events once a product is enterprise-ready.</p>'}
      </div>
    </div>
    <hr />
    <h3>Funding</h3>
    <p class="muted small">You own ${pct(state.company.founderEquity, 1)}. Every round dilutes that, and your exit pays out on what is left. Bootstrapping all the way is a real strategy.</p>
    <div class="grid two">${offers.map((o) => `
      <div class="tile">
        <h3>${esc(o.name)}<span class="tag">${pct(o.equity)} equity</span></h3>
        <p>${esc(o.blurb)}</p>
        <div class="spread small"><span>Investor valuation</span><b>${money(o.valuation)}</b></div>
        <div class="spread small"><span>You receive</span><b>${money(o.cash)}</b></div>
        ${btn('raise', o.available ? `Raise ${o.name}` : o.reason || 'Unavailable', { id: o.id, disabled: !o.available })}
      </div>`).join('')}</div>
    <hr />
    <h3>History</h3>
    ${sparkline(state.stats.history)}`;
}

function sparkline(history) {
  if (history.length < 2) return '<p class="muted small">Not enough history yet.</p>';
  const pts = history.slice(-160);
  const max = Math.max(...pts.map((p) => Math.max(p.revenue, p.expense)), 1);
  const w = 600;
  const h = 64;
  const path = (key) => pts.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${((i / (pts.length - 1)) * w).toFixed(1)},${(h - (p[key] / max) * (h - 4) - 2).toFixed(1)}`).join(' ');
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Revenue and expenses over time">
      <path d="${path('revenue')}" fill="none" stroke="#6ec07a" stroke-width="2" />
      <path d="${path('expense')}" fill="none" stroke="#ef6f6c" stroke-width="2" stroke-dasharray="4 3" />
    </svg>
    <div class="small muted"><span style="color:#6ec07a">— revenue</span> · <span style="color:#ef6f6c">-- expenses</span> · peak ${money(max)}/day</div>`;
}

// ----------------------------------------------------------------- Office
export function office(ctx) {
  const { state, mods } = ctx;
  const tiers = officeOptions(state);
  const rooms = roomOptions(state);
  return `
    <h3>Premises</h3>
    <div class="grid two">${tiers.map((t) => `
      <div class="tile" style="${t.owned && !t.current ? 'opacity:.55' : ''}">
        <h3>${esc(t.name)}${t.current ? '<span class="tag" style="color:var(--accent)">current</span>' : ''}</h3>
        <p>${esc(t.blurb)}</p>
        <div class="spread small"><span>Desks</span><b>${t.desks}</b></div>
        <div class="spread small"><span>Rent</span><b>${money(t.rent)}/day</b></div>
        <div class="spread small"><span>Cost</span><b>${t.cost ? money(t.cost) : 'free'}</b></div>
        ${t.owned ? '' : btn('office', t.available ? `Move in (${money(t.cost)})` : t.reason || 'Unavailable', { id: t.id, disabled: !t.available })}
      </div>`).join('')}</div>
    <hr />
    <h3>Rooms</h3>
    <p class="muted small">Rooms are permanent for this run and appear in the office view immediately.</p>
    <div class="grid two">${rooms.map((r) => `
      <div class="tile" style="${r.owned ? 'opacity:.6' : ''}">
        <h3>${esc(r.name)}<span class="tag">${r.owned ? 'built' : money(r.cost)}</span></h3>
        <p>${esc(r.blurb)}</p>
        <div class="small muted">${Object.entries(r.effect).map(([k, v]) => `${k} ${typeof v === 'number' && Math.abs(v) < 1 ? (v > 0 ? '+' : '') + Math.round(v * 100) + '%' : '+' + v}`).join(' · ')}</div>
        ${r.owned ? '' : btn('room', r.available ? 'Build' : r.reason || 'Unavailable', { id: r.id, disabled: !r.available })}
      </div>`).join('')}</div>`;
}

// ------------------------------------------------------------ Competitors
export function competitors(ctx) {
  const { state, mods } = ctx;
  const canBuy = has(mods, 'acquisitions');
  const targets = acquisitionTargets(state);
  return `
    <p class="muted small">Rivals take share out of the markets your products sell into. Beating them on revenue slowly pushes them back; buying them removes the pressure outright.</p>
    <div class="grid two">${state.competitors.map((c) => {
      const t = targets.find((x) => x.id === c.id);
      return `<div class="tile" style="${c.alive ? '' : 'opacity:.5'}">
        <h3>${esc(c.name)}<span class="tag">${c.acquired ? 'acquired by you' : c.alive ? `strength ${c.strength.toFixed(2)}` : 'shut down'}</span></h3>
        <p>${esc(c.blurb)}</p>
        <div class="small muted">Markets: ${c.markets.map((m) => `${categoryById(m)?.name || m} ${Math.round((c.shares[m] || 0) * 100)}%`).join(' · ')}</div>
        ${t && canBuy ? btn('acquire', `Acquire for ${money(t.price)}`, { id: c.id, disabled: state.company.cash < t.price }) : ''}
      </div>`;
    }).join('')}</div>
    <hr />
    <h3>Market share</h3>
    ${[...new Set(state.products.map((p) => p.category))].map((cat) => {
      const shares = marketShares(state, cat);
      const total = shares.reduce((a, s) => a + s.share, 0);
      return `<div class="spread small"><span>${esc(categoryById(cat).name)}</span><b>you hold ${pct(Math.max(0, 1 - total))}</b></div>${bar(Math.max(0, 1 - total), 'good')}`;
    }).join('')}`;
}

// ---------------------------------------------------------------- Prestige
export function prestige(ctx) {
  const meta = ctx.state.meta;
  const ups = prestigeLevels(meta);
  return `
    <h2>Founder upgrades</h2>
    <p class="muted small">Founder Reputation is permanent. It is earned by exiting a company and spent on advantages that apply to every future run.</p>
    <div class="spread"><span>Available</span><b>${meta.founderRep} FR</b></div>
    <hr />
    <div class="grid two">${ups.map((u) => `
      <div class="tile">
        <h3>${esc(u.name)}<span class="tag">${u.level}/${u.max}</span></h3>
        <p>${esc(u.desc)}</p>
        ${u.maxed ? '<p class="small" style="color:var(--good)">Fully upgraded.</p>'
          : btn('buy-prestige', `Buy for ${u.price} FR`, { id: u.id, disabled: meta.founderRep < u.price })}
      </div>`).join('')}</div>
    <div class="row" style="margin-top:14px">${btn('close-overlay', 'Close', { cls: 'btn secondary' })}</div>`;
}

export const PANELS = { company, products, employees, departments, research, finance, office, competitors };
