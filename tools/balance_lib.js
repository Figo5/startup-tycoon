// Long-horizon balance simulation. Drives the engine with a scripted operator
// so pacing can be measured without a browser. Run: npm run balance
import { newGame, emptyMeta, REAL_SECONDS_PER_DAY } from '../src/sim/state.js';
import { step } from '../src/sim/engine.js';
import { computeMods, has } from '../src/sim/modifiers.js';
import { hire, canHire, promote, setManager, deskPressure } from '../src/sim/workforce.js';
import {
  liveProducts, suggestProject, queueProject, availableCategories, createProduct,
  supportCoverage, maxProducts
} from '../src/sim/products.js';
import { computeWorkforce } from '../src/sim/workforce.js';
import { setCapacity, computeLoad, effectiveCapacity } from '../src/sim/infra.js';
import { researchStatus, startResearch, researchSlots, allResearch } from '../src/sim/research.js';
import { fundingOffers, raise } from '../src/sim/funding.js';
import { officeOptions, upgradeOffice, roomOptions, buyRoom } from '../src/sim/office.js';
import { resolveEvent, choiceCost, eventText } from '../src/sim/events.js';
import { eventById } from '../src/data/events.js';
import { exitPreview, performExit } from '../src/sim/prestige.js';
import { acquisitionTargets, acquire } from '../src/sim/competitors.js';
import { addBoost } from '../src/sim/modifiers.js';
import { ensureRoadmap, suggestRoadmap, startRoadmap } from '../src/sim/roadmap.js';
import { advisorOffers, hireAdvisor } from '../src/sim/advisors.js';
import { acquisitionOffers, acquireCompany } from '../src/sim/acquisitions.js';
import { offeredGoals, acceptGoal } from '../src/sim/goals.js';
import { money, abbrev } from '../src/sim/util.js';

export const DAYS_PER_REAL_HOUR = 3600 / REAL_SECONDS_PER_DAY;   // 30

export const PROFILES = {
  idle: { checkEveryDays: 15, minigames: false, label: 'Idle (checks ~every 30 min)' },
  moderate: { checkEveryDays: 6, minigames: false, label: 'Moderate (checks ~every 12 min)' },
  active: { checkEveryDays: 2.5, minigames: true, label: 'Active (checks ~every 5 min, plays minigames)' }
};

export function operate(state, profile, marks) {
  const mods = computeMods(state);
  const wf = computeWorkforce(state, mods);
  const cash = () => state.company.cash;
  const rev = state.stats.revenueDay;

  // 1. Events
  for (const p of state.events.pending.slice()) {
    const def = eventById(p.eventId);
    let choice = def.choices.find((c) => c.minigame && profile.minigames)
      || def.choices.find((c) => choiceCost(state, c) <= cash() * 0.25 && !c.minigame)
      || def.choices.find((c) => c.id === def.auto);
    if (choice?.minigame) {
      const win = Math.random() < 0.72;
      const plain = def.choices.find((c) => !c.minigame && choiceCost(state, c) <= cash());
      resolveEvent(state, mods, p.id, (plain || def.choices[def.choices.length - 1]).id, null);
      if (win) addBoost(state, 'minigame', { devSpeed: 0.2, churn: -0.1 }, 3, 'Minigame');
    } else if (choice) {
      resolveEvent(state, mods, p.id, choice.id, null);
    }
  }

  // 2. Keep engineering busy
  for (const p of state.products) {
    if (p.projects.length === 0) {
      const t = suggestProject(state, mods, p);
      if (t) queueProject(state, mods, p.id, t.id);
    }
  }

  // 3. Marketing budget: a quarter of revenue, never more than cash allows
  if (liveProducts(state).length) {
    state.company.marketingBudget = Math.max(0, Math.min(rev * 0.28, cash() / 40));
  }

  // 4. Infra capacity
  if (!has(mods, 'autoscale')) {
    const want = Math.ceil(computeLoad(state) / 0.7);
    if (Math.abs(want - state.infra.capacity) > 2) setCapacity(state, Math.max(8, want));
  }

  // 5. Hiring - headcount is kept in proportion to revenue, not to free desks
  const { capacity } = deskPressure(state, mods);
  const affordableStaff = Math.max(2, Math.floor(rev / 420) + 2);
  while (state.employees.length < Math.min(capacity, affordableStaff) && state.candidates.length) {
    const cov = supportCoverage(state, mods, wf);
    const count = (role) => state.employees.filter((e) => e.role === role).length;
    const engCount = state.employees.filter((e) => e.dept === 'engineering').length;
    const needs = [];
    if (cov < 0.9) needs.push('support_specialist');
    const scale = Math.floor(rev / 14000);
    if (engCount < 1 + state.products.length * 2 + scale) needs.push('senior_engineer', 'engineer');
    if (liveProducts(state).some((p) => ['b2b', 'enterprise', 'saas'].includes(p.category))
      && count('sales_rep') < 2 + scale) needs.push('sales_rep');
    if (count('marketer') < 1 + scale) needs.push('marketer');
    if (state.infra.utilization > 0.6 && count('infra_engineer') < 2 + Math.floor(scale / 3)) needs.push('infra_engineer');
    if (count('designer') < Math.min(6, state.products.length + Math.floor(scale / 3))) needs.push('designer');
    if (state.employees.length > 10 && count('pm') < Math.min(8, state.products.length + Math.floor(scale / 4))) needs.push('pm');
    if (state.employees.length >= 12 && count('manager') < 6) needs.push('manager');
    needs.push('engineer');

    let picked = null;
    for (const role of needs) {
      const c = state.candidates.filter((x) => x.role === role).sort((a, b) => b.skill - a.skill)[0];
      if (c) { picked = c; break; }
    }
    if (!picked) break;
    const newBurn = state.stats.expenseDay + picked.salary / 365;
    const runway = (cash() - picked.signingBonus) / Math.max(1, newBurn - rev);
    if (rev < newBurn && runway < 45) break;
    const r = hire(state, picked.id, mods);
    if (!r.ok) break;
    if (!marks.firstHire) marks.firstHire = state.time.day;
    if (r.employee.role === 'manager') {
      const dept = ['engineering', 'sales', 'support', 'marketing'].find((d) => !state.departments[d].managerId);
      if (dept) { setManager(state, dept, r.employee.id); if (!marks.firstManager) marks.firstManager = state.time.day; }
    }
  }

  // 6. Research
  if (state.research.active.length < researchSlots(state, mods)) {
    const opts = allResearch()
      .map((r) => ({ r, s: researchStatus(state, mods, r.id) }))
      .filter((x) => x.s.state === 'available' && x.r.cost < cash() * 0.35)
      .sort((a, b) => a.r.cost - b.r.cost);
    if (opts.length) startResearch(state, mods, opts[0].r.id);
  }

  // 7. Office and rooms
  const office = officeOptions(state).find((o) => o.available);
  if (office && cash() > office.cost * 2.2) {
    upgradeOffice(state);
    if (!marks.firstOffice) marks.firstOffice = state.time.day;
  }
  const room = roomOptions(state).filter((r) => r.available).sort((a, b) => a.cost - b.cost)[0];
  if (room && cash() > room.cost * 3.5) buyRoom(state, room.id);

  // 8. New products
  if (state.products.length < maxProducts(state)) {
    const owned = new Set(state.products.map((p) => p.category));
    const cats = availableCategories(state, mods).filter((c) => c.available && cash() > c.cost * 4);
    const fresh = cats.filter((c) => !owned.has(c.id));
    const best = (fresh.length ? fresh : cats)
      .sort((a, b) => (b.marketBase * (b.arpu.smb + b.arpu.midmarket)) - (a.marketBase * (a.arpu.smb + a.arpu.midmarket)))[0];
    if (best && state.products.every((p) => p.stage === 'live')) {
      createProduct(state, mods, best.id);
      if (state.products.length === 2 && !marks.secondProduct) marks.secondProduct = state.time.day;
    }
  }

  // 9. Funding
  if (profile.raise !== false) {
    const offer = fundingOffers(state, mods).find((o) => o.available);
    const runway = state.stats.netDay >= 0 ? Infinity : cash() / -state.stats.netDay;
    if (offer && (runway < 90 || offer.cash > cash() * 2.5)) {
      raise(state, mods, offer.id);
      if (!marks.firstFunding) marks.firstFunding = state.time.day;
    }
  }

  // 9b. Buy out rivals once there is spare cash
  if (has(mods, 'acquisitions')) {
    const t = acquisitionTargets(state).filter((x) => cash() > x.price * 3.5).sort((a, b) => b.strength - a.strength)[0];
    if (t) { acquire(state, mods, t.id); marks.firstAcquisition = marks.firstAcquisition || state.time.day; }
  }

  // 9c. The new long-term systems. Only played when the profile says so, so the
  //     baseline pacing numbers stay comparable with earlier reports. `skip`
  //     lets the per-system contribution be measured one at a time.
  const skipped = profile.skip || [];
  if (profile.systems) {
    // Roadmap: keep one initiative running whenever the cash allows it.
    if (!skipped.includes('roadmap')) {
      for (const p of state.products) {
        const rm = ensureRoadmap(p);
        if (rm.active) continue;
        const pick = suggestRoadmap(state, p);
        if (pick && cash() > pick.cost * 5) {
          const r = startRoadmap(state, mods, p.id, pick.id);
          if (r.ok) marks.firstRoadmap = marks.firstRoadmap || state.time.day;
        }
      }
    }
    // Advisor: fill slots when the engagement fee is comfortably affordable.
    if (!skipped.includes('advisor')) {
      const hireable = advisorOffers(state).filter((a) => a.available).sort((a, b) => b.fee - a.fee)[0];
      if (hireable && cash() > hireable.fee * 6) hireAdvisor(state, hireable.id);
    }
    // Company for sale: buy when it is cheap relative to cash on hand.
    if (!skipped.includes('acquisition')) {
      const target = acquisitionOffers(state).filter((t) => t.available).sort((a, b) => a.price - b.price)[0];
      if (target && cash() > target.price * 4) acquireCompany(state, mods, target.id);
    }
    // Goals: take whatever is on offer, one at a time.
    if (!skipped.includes('goal') && !state.goals.active) {
      const g = offeredGoals(state)[0];
      if (g) acceptGoal(state, g.id);
    }
  }

  // 10. Promotions for management
  if (state.employees.length >= 12) {
    for (const dept of ['engineering', 'sales', 'support', 'marketing', 'product', 'infra']) {
      if (state.departments[dept].managerId) continue;
      const cand = state.employees.find((e) => e.isManager && !Object.values(state.departments).some((d) => d.managerId === e.id));
      if (cand) { setManager(state, dept, cand.id); if (!marks.firstManager) marks.firstManager = state.time.day; continue; }
      const promotable = state.employees.filter((e) => e.dept === dept && e.skill >= 6 && ['engineer', 'senior_engineer', 'sales_rep'].includes(e.role))
        .sort((a, b) => b.skill - a.skill)[0];
      if (promotable && state.employees.filter((e) => e.dept === dept).length > 3) {
        const r = promote(state, promotable.id);
        if (r.ok && state.employees.find((e) => e.id === promotable.id).isManager) {
          setManager(state, dept, promotable.id);
          if (!marks.firstManager) marks.firstManager = state.time.day;
        }
      }
    }
  }

  if (!marks.firstContract && state.contracts.length) marks.firstContract = state.time.day;
  if (!marks.firstEnterprise && liveProducts(state).some((p) => p.customers.enterprise > 1)) marks.firstEnterprise = state.time.day;
  if (!marks.stages[state.company.stage]) marks.stages[state.company.stage] = state.time.day;

  // 11. Exit
  const exits = exitPreview(state, mods).filter((e) => e.available);
  if (exits.length && !marks.exit && (state.company.stage === 'late' || profile.exitEarly)) {
    const best = exits.sort((a, b) => b.rep - a.rep)[0];
    marks.exit = { day: state.time.day, name: best.name, value: best.value, rep: best.rep, equity: state.company.founderEquity };
  }
}

export function run(seed, profileName, horizonDays, opts = {}) {
  const profile = { ...PROFILES[profileName], ...opts };
  const state = newGame({ seed, meta: opts.meta || emptyMeta(), scenarioId: opts.scenarioId || 'standard' });
  const marks = { stages: {} };
  const checkpoints = opts.checkpoints || [];
  const results = [];
  let nextCheck = 0;
  let cpi = 0;
  const STEP = 0.05;

  for (let d = 0; d < horizonDays; d += STEP) {
    step(state, STEP, null);
    if (state.time.day >= nextCheck) {
      operate(state, profile, marks);
      nextCheck = state.time.day + profile.checkEveryDays;
    }
    while (cpi < checkpoints.length && state.time.day >= checkpoints[cpi].days) {
      results.push({ label: checkpoints[cpi].label, ...snap(state) });
      cpi++;
    }
    if (marks.exit) break;
  }
  return { state, marks, results };
}

export function snap(state) {
  return {
    day: Math.round(state.time.day),
    cash: state.company.cash,
    rev: state.stats.revenueDay,
    exp: state.stats.expenseDay,
    users: state.stats.users,
    customers: state.stats.customers,
    staff: state.employees.length,
    stage: state.company.stage,
    val: state.stats.valuation,
    products: state.products.length,
    equity: state.company.founderEquity,
    research: state.research.completed.length,
    office: state.office.tier
  };
}

export const hrs = (d) => (d == null ? '  --  ' : `${(d / DAYS_PER_REAL_HOUR).toFixed(2)}h`);
const pad = (s, n) => String(s).padEnd(n);
const padl = (s, n) => String(s).padStart(n);

export function report(title, rows) {
  console.log(`\n${title}`);
  console.log(pad('checkpoint', 12) + padl('day', 6) + padl('cash', 10) + padl('rev/day', 10)
    + padl('exp/day', 10) + padl('users', 9) + padl('cust', 8) + padl('staff', 6) + padl('prod', 5)
    + padl('valuation', 12) + '  stage');
  for (const r of rows) {
    console.log(pad(r.label, 12) + padl(r.day, 6) + padl(money(r.cash), 10) + padl(money(r.rev), 10)
      + padl(money(r.exp), 10) + padl(abbrev(r.users), 9) + padl(abbrev(r.customers), 8)
      + padl(r.staff, 6) + padl(r.products, 5) + padl(money(r.val), 12) + '  ' + r.stage);
  }
}

export const CHECKPOINTS = [
  { label: '10 min', days: DAYS_PER_REAL_HOUR / 6 },
  { label: '1 hour', days: DAYS_PER_REAL_HOUR },
  { label: '4 hours', days: DAYS_PER_REAL_HOUR * 4 },
  { label: '8 hours', days: DAYS_PER_REAL_HOUR * 8 },
  { label: '24 hours', days: DAYS_PER_REAL_HOUR * 24 },
  { label: '3 days', days: DAYS_PER_REAL_HOUR * 72 }
];

