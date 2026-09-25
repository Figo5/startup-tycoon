import { clamp, sum } from './util.js';
import { rnd, chance, perDay, range } from './rng.js';
import { ROLES, roleById, DEPARTMENTS, departmentById, SPECIALTIES } from '../data/roles.js';
import { tierById } from '../data/office.js';
import { mul, flat, has, addBoost } from './modifiers.js';
import { refreshCandidates, makeEmployee, metaEffects, traitList, hasTrait, addStory } from './state.js';
import { paceById, levelName, jobTitle } from '../data/traits.js';

const OUTPUT_KEYS = ['eng', 'product', 'design', 'sales', 'marketing', 'support', 'infra', 'quality', 'manage'];
const specById = (id) => SPECIALTIES.find((s) => s.id === id);

/** 0 = first listed priority, 0.5 = balanced, 1 = last listed priority. */
export function prioritySplit(state, deptId) {
  const dept = departmentById(deptId);
  const chosen = state.departments[deptId]?.priority || 'balanced';
  const i = dept.priorities.findIndex((p) => p.id === chosen);
  return i < 0 ? 0.5 : i / (dept.priorities.length - 1);
}

export function deskPressure(state, mods) {
  const capacity = state.office.deskCapacity + flat(mods, 'deskBonus');
  return { capacity, over: Math.max(0, state.employees.length - capacity) };
}

export function marketSalary(roleId, skill) {
  const role = roleById(roleId);
  return Math.round((role.salary * (0.9 + skill / 14)) / 500) * 500;
}

/** Market salary for this particular person, including what their traits ask for. */
export function fairSalary(e) {
  let m = 1;
  for (const t of traitList(e)) m += t.effects.salary || 0;
  return Math.round((marketSalary(e.role, e.skill) * m) / 500) * 500;
}

export function deptMultiplier(state, mods, deptId) {
  const d = state.departments[deptId];
  let m = 1 + flat(mods, 'deptBonus') + flat(mods, 'managerBonus') * 0;
  if (d?.managerId) {
    const mgr = state.employees.find((e) => e.id === d.managerId);
    if (mgr) m += (0.10 + mgr.skill * 0.012) * (1 + (mods.managerBonus || 0));
  }
  return m;
}

/** Output multiplier from energy: fine until tired, then falls off hard. */
export function energyMul(e) {
  const en = Number.isFinite(e.energy) ? e.energy : 0.9;
  return en >= 0.4 ? 1 : 0.4 + en * 1.5;
}

export const onLeave = (state, e) => (e.leaveUntil || 0) > state.time.day;
export const isBurntOut = (e) => (Number.isFinite(e.energy) ? e.energy : 0.9) < 0.2;

/** Everything about one person that scales their whole output. */
export function personalMul(state, mods, e) {
  if (onLeave(state, e)) return 0;
  const pace = paceById(state.company.pace);
  let m = 1 + (pace.out || 0);
  for (const t of traitList(e)) {
    const fx = t.effects;
    if (fx.out) m += fx.out;
    if (fx.crunch && state.company.pace === 'crunch') m += fx.crunch;
    if (fx.crisis && state.products.some((p) => p.outage > 0)) m += fx.crisis;
  }
  if (hasTrait(e, 'genius')) m *= clamp(e.streak || 1, 0.4, 1.8);
  return Math.max(0, m) * energyMul(e);
}

/** Aggregate every employee into per-output-key totals, company-wide and per department. */
export function computeWorkforce(state, mods) {
  const { capacity } = deskPressure(state, mods);
  const crowd = clamp(capacity / Math.max(1, state.employees.length), 0.62, 1);
  const out = Object.fromEntries(OUTPUT_KEYS.map((k) => [k, 0]));
  const byDept = {};
  for (const d of DEPARTMENTS) byDept[d.id] = Object.fromEntries(OUTPUT_KEYS.map((k) => [k, 0]));
  const byPerson = new Map();

  for (const e of state.employees) {
    const role = roleById(e.role);
    if (!role) continue;
    const moraleMul = 0.55 + clamp(e.morale, 0, 1.2) * 0.6;
    const dm = deptMultiplier(state, mods, e.dept);
    const spec = specById(e.specialty)?.effect || {};
    const base = e.skill * e.productivity * moraleMul * dm * crowd * personalMul(state, mods, e);
    const traitKeys = {};
    for (const t of traitList(e)) for (const [k, v] of Object.entries(t.effects.outKey || {})) traitKeys[k] = (traitKeys[k] || 0) + v;
    let total = 0;
    for (const k of OUTPUT_KEYS) {
      const r = ((role.output[k] || 0) + (spec[k] || 0)) * (1 + (traitKeys[k] || 0));
      if (!r) continue;
      const v = base * r;
      out[k] += v;
      byDept[e.dept] && (byDept[e.dept][k] += v);
      total += v;
    }
    byPerson.set(e.id, total);
  }

  out.eng *= mul(mods, 'devSpeed');
  out.sales *= mul(mods, 'sales');
  out.marketing *= mul(mods, 'marketing');
  out.support *= mul(mods, 'support');

  const payrollDay = sum(state.employees, (e) => e.salary) / 365 * mul(mods, 'payroll', -0.6);
  return { out, byDept, payrollDay, crowd, capacity, byPerson };
}

export function officeMoraleTarget(state, mods) {
  const tier = tierById(state.office.tier);
  const { capacity } = deskPressure(state, mods);
  const crowding = clamp((state.employees.length - capacity) / Math.max(1, capacity), 0, 1) * 0.35;
  return clamp((tier?.moraleBase ?? 0.55) + flat(mods, 'moraleGain') - crowding, 0.1, 1.05);
}

/** Morale nudges from colleagues' traits: per department, plus company-wide. */
export function moraleAuras(state) {
  const dept = {};
  let company = 0;
  for (const e of state.employees) {
    for (const t of traitList(e)) {
      if (t.effects.teamMorale) dept[e.dept] = (dept[e.dept] || 0) + t.effects.teamMorale;
      if (t.effects.companyMorale) company += t.effects.companyMorale;
    }
  }
  for (const k of Object.keys(dept)) dept[k] = clamp(dept[k], -0.15, 0.15);
  return { dept, company: clamp(company, 0, 0.1) };
}

/** Where energy settles for this person under the current pace and office. */
export function energyTarget(state, mods, e) {
  const pace = paceById(state.company.pace);
  let drain = 0;
  for (const t of traitList(e)) drain += t.effects.drain || 0;
  const { capacity } = deskPressure(state, mods);
  const crowding = clamp((state.employees.length - capacity) / Math.max(1, capacity), 0, 1) * 0.25;
  // Crunch is expressed as a larger drop than the pace table shows, so that a
  // crunching team settles well into burnout if nobody calls it off.
  const paceDrop = state.company.pace === 'crunch' ? 0.75 : -(pace.energy || 0);
  return clamp(0.9 + flat(mods, 'rest') - paceDrop - crowding - Math.max(0, drain) * 0.1, 0.02, 1);
}

export function tickWorkforce(state, mods, days, log) {
  const target = officeMoraleTarget(state, mods);
  const mentor = state.employees.some((e) => e.specialty === 'mentor') ? 1.35 : 1;
  const churnBase = 0.0030 * mul(mods, 'staffChurn', -0.9);
  const auras = moraleAuras(state);
  const pace = paceById(state.company.pace);
  const day = state.time.day;

  for (const e of state.employees) {
    const under = e.salary > 0 && e.salary < fairSalary(e) * 0.92 ? 0.12 : 0;
    let personal = (auras.dept[e.dept] || 0) + auras.company + (pace.morale || 0);
    // A person's own aura is for their colleagues, not for themselves.
    for (const t of traitList(e)) personal -= (t.effects.teamMorale || 0) * 0.5;
    let xpMul = 1;
    for (const t of traitList(e)) {
      if (t.effects.xp) xpMul += t.effects.xp;
      if (t.effects.restless && day - (e.promotedDay ?? e.hiredDay ?? 0) > t.effects.restless) personal -= 0.15;
    }
    if (isBurntOut(e)) personal -= 0.15;
    e.morale = clamp(e.morale + (target + personal - under - e.morale) * clamp(0.14 * days, 0, 1), 0, 1.1);

    // Energy settles toward a target set by pace, rest rooms and crowding.
    // Tiring is faster for anyone whose traits drain them; leave recovers fast.
    if (!Number.isFinite(e.energy)) e.energy = 0.9;
    let drain = 0;
    for (const t of traitList(e)) drain += t.effects.drain || 0;
    const tgt = onLeave(state, e) ? 1 : energyTarget(state, mods, e);
    const rate = onLeave(state, e) ? 0.35 : tgt < e.energy ? 0.08 * (1 + drain) : 0.09;
    const wasOk = !isBurntOut(e);
    e.energy = clamp(e.energy + (tgt - e.energy) * clamp(Math.max(0.01, rate) * days, 0, 1), 0, 1);
    if (wasOk && isBurntOut(e) && e.id !== 'founder') {
      addStory(e, day, 'Burnt out');
      log?.(`${e.name} is burnt out and barely working. Ease the pace or send them on leave.`, 'bad');
    }

    // Unreliable geniuses have good weeks and bad weeks.
    if (hasTrait(e, 'genius') && chance(state.rng, perDay(0.45, days))) {
      e.streak = Math.round(range(state.rng, 0.45, 1.75) * 100) / 100;
    }

    e.experience += 0.02 * days * mentor * Math.max(0.2, xpMul);
    e.productivity = Math.min(1.5, e.productivity + 0.0025 * days * mentor);
    if (e.experience > 12 && e.skill < 12) {
      const before = levelName(e.skill);
      e.skill = Math.round((e.skill + 0.5) * 10) / 10;
      e.experience = 0;
      const after = levelName(e.skill);
      if (after !== before && e.id !== 'founder') addStory(e, day, `Grew into a ${jobTitle(e.skill, roleById(e.role)?.name)}`);
    }
  }

  // Attrition. The founder never quits.
  const risky = state.employees.filter((e) => e.id !== 'founder');
  for (const e of risky) {
    let tm = 1;
    for (const t of traitList(e)) tm += t.effects.attrition || 0;
    if (isBurntOut(e)) tm *= 2.2;
    const p = churnBase * Math.max(0.05, tm) * (1.9 - clamp(e.morale, 0, 1.1) * 1.4);
    if (chance(state.rng, perDay(Math.max(0, p), days))) {
      removeEmployee(state, e.id);
      log?.(`${e.name} (${roleById(e.role).name}) resigned${isBurntOut(e) ? ', burnt out' : ''}.`, 'bad');
      recordAlumnus(state, e, 'resigned');
    }
  }

  // Candidate pool
  state.candidates = state.candidates.filter((c) => c.expiresDay > state.time.day);
  // A bigger company sees more applicants, so hiring never becomes the bottleneck.
  const scale = 1 + state.employees.length / 12;
  state.candidateTimer -= days * scale * (1 + flat(mods, 'candidateRefresh'));
  const slots = 3 + flat(mods, 'candidateSlots') + Math.floor(state.employees.length / 8);
  if (state.candidateTimer <= 0) {
    state.candidateTimer = 2.5;
    if (state.candidates.length < slots) refreshCandidates(state, 1);
  }

  if (has(mods, 'autoHire')) autoHire(state, mods, log);
}

/** People who have left, remembered for stories and later runs. */
export function recordAlumnus(state, e, why) {
  if (!e || e.id === 'founder') return;
  if (!Array.isArray(state.alumni)) state.alumni = [];
  state.alumni.unshift({ name: e.name, role: e.role, skill: e.skill, traits: (e.traits || []).slice(), why, day: Math.floor(state.time.day) });
  if (state.alumni.length > 30) state.alumni.length = 30;
}

/** Paid leave: no output for a few days, and they come back rested. */
export function sendOnLeave(state, id, days = 5) {
  const e = state.employees.find((x) => x.id === id);
  if (!e) return { ok: false, reason: 'Not found.' };
  if (onLeave(state, e)) return { ok: false, reason: `${e.name} is already on leave.` };
  e.leaveUntil = state.time.day + days;
  e.morale = clamp(e.morale + 0.1, 0, 1.1);
  addStory(e, state.time.day, 'Took a well-earned break');
  return { ok: true, until: e.leaveUntil };
}

/** A 10% raise. Counts as recognition, which is what ambitious people want. */
export function giveRaise(state, id) {
  const e = state.employees.find((x) => x.id === id);
  if (!e || e.id === 'founder') return { ok: false, reason: 'Not possible.' };
  e.salary = Math.round(e.salary * 1.1);
  e.morale = clamp(e.morale + 0.12, 0, 1.1);
  e.promotedDay = state.time.day;
  return { ok: true };
}

export function setPace(state, id) {
  if (!['relaxed', 'normal', 'crunch'].includes(id)) return { ok: false, reason: 'Unknown pace.' };
  state.company.pace = id;
  return { ok: true };
}

export function removeEmployee(state, id) {
  const i = state.employees.findIndex((e) => e.id === id);
  if (i < 0) return null;
  const [e] = state.employees.splice(i, 1);
  for (const d of Object.values(state.departments)) if (d.managerId === e.id) d.managerId = null;
  return e;
}

export function hireCost(candidate) {
  return candidate.signingBonus || 0;
}

export function canHire(state, mods) {
  const { capacity } = deskPressure(state, mods);
  return state.employees.length < capacity;
}

export function hire(state, candidateId, mods) {
  const i = state.candidates.findIndex((c) => c.id === candidateId);
  if (i < 0) return { ok: false, reason: 'Candidate no longer available.' };
  const c = state.candidates[i];
  if (!canHire(state, mods)) return { ok: false, reason: 'No free desks. Expand the office first.' };
  const cost = hireCost(c);
  if (state.company.cash < cost) return { ok: false, reason: 'Not enough cash for the signing bonus.' };
  state.candidates.splice(i, 1);
  state.company.cash -= cost;
  const e = { ...c };
  delete e.signingBonus; delete e.star; delete e.expiresDay;
  e.id = c.id.replace('cand', 'emp');
  e.hiredDay = state.time.day;
  e.morale = 0.8;
  if (!Array.isArray(e.story)) e.story = [];
  addStory(e, state.time.day, `Joined as ${roleById(e.role)?.name || e.role}`);
  state.employees.push(e);
  return { ok: true, employee: e };
}

export function fire(state, id) {
  const e = state.employees.find((x) => x.id === id);
  if (!e || e.id === 'founder') return { ok: false, reason: 'Cannot let the founder go.' };
  const severance = Math.round(e.salary / 12);
  state.company.cash -= severance;
  removeEmployee(state, id);
  recordAlumnus(state, e, 'let go');
  for (const other of state.employees) other.morale = clamp(other.morale - 0.05, 0, 1.1);
  return { ok: true, severance };
}

export function promote(state, id) {
  const e = state.employees.find((x) => x.id === id);
  if (!e) return { ok: false, reason: 'Not found.' };
  const ladder = { engineer: 'senior_engineer', support_specialist: 'pm', sales_rep: 'manager', senior_engineer: 'manager',
    designer: 'pm', marketer: 'manager', pm: 'manager', infra_engineer: 'manager' };
  const next = ladder[e.role];
  if (!next) return { ok: false, reason: 'No promotion path from this role.' };
  const role = roleById(next);
  if (e.skill < role.skill[0]) return { ok: false, reason: `Needs skill ${role.skill[0]}+ (has ${e.skill}).` };
  e.role = next;
  e.isManager = next === 'manager';
  e.salary = Math.max(e.salary, fairSalary(e));
  e.morale = clamp(e.morale + 0.15, 0, 1.1);
  e.promotedDay = state.time.day;
  addStory(e, state.time.day, `Promoted to ${role.name}`);
  if (!role.anyDept) e.dept = role.dept;
  return { ok: true, role: role.name };
}

export function reassign(state, id, deptId) {
  const e = state.employees.find((x) => x.id === id);
  if (!e) return { ok: false, reason: 'Not found.' };
  const role = roleById(e.role);
  if (!role.anyDept && role.dept !== deptId && e.role !== 'founder') {
    return { ok: false, reason: `${role.name}s only work in ${departmentById(role.dept).name}.` };
  }
  e.dept = deptId;
  return { ok: true };
}

export function setManager(state, deptId, employeeId) {
  const e = state.employees.find((x) => x.id === employeeId);
  if (employeeId && (!e || !e.isManager)) return { ok: false, reason: 'Only managers can run a department.' };
  for (const d of Object.values(state.departments)) if (d.managerId === employeeId) d.managerId = null;
  state.departments[deptId].managerId = employeeId || null;
  if (e) e.dept = deptId;
  return { ok: true };
}

function autoHire(state, mods, log) {
  if (!canHire(state, mods)) return;
  const runway = state.stats.netDay >= 0 ? Infinity : state.company.cash / -state.stats.netDay;
  if (runway < 75) return;
  const best = state.candidates.slice().sort((a, b) => b.skill - a.skill)[0];
  if (!best) return;
  if (state.company.cash < best.signingBonus + best.salary / 4) return;
  const r = hire(state, best.id, mods);
  if (r.ok) log?.(`Recruiting pipeline hired ${r.employee.name} (${roleById(r.employee.role).name}).`, 'good');
}
