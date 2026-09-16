import { clamp, sum } from './util.js';
import { rnd, chance, perDay, range } from './rng.js';
import { ROLES, roleById, DEPARTMENTS, departmentById, SPECIALTIES } from '../data/roles.js';
import { tierById } from '../data/office.js';
import { mul, flat, has, addBoost } from './modifiers.js';
import { refreshCandidates, makeEmployee, metaEffects } from './state.js';

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

export function deptMultiplier(state, mods, deptId) {
  const d = state.departments[deptId];
  let m = 1 + flat(mods, 'deptBonus') + flat(mods, 'managerBonus') * 0;
  if (d?.managerId) {
    const mgr = state.employees.find((e) => e.id === d.managerId);
    if (mgr) m += (0.10 + mgr.skill * 0.012) * (1 + (mods.managerBonus || 0));
  }
  return m;
}

/** Aggregate every employee into per-output-key totals, company-wide and per department. */
export function computeWorkforce(state, mods) {
  const { capacity } = deskPressure(state, mods);
  const crowd = clamp(capacity / Math.max(1, state.employees.length), 0.62, 1);
  const out = Object.fromEntries(OUTPUT_KEYS.map((k) => [k, 0]));
  const byDept = {};
  for (const d of DEPARTMENTS) byDept[d.id] = Object.fromEntries(OUTPUT_KEYS.map((k) => [k, 0]));

  for (const e of state.employees) {
    const role = roleById(e.role);
    if (!role) continue;
    const moraleMul = 0.55 + clamp(e.morale, 0, 1.2) * 0.6;
    const dm = deptMultiplier(state, mods, e.dept);
    const spec = specById(e.specialty)?.effect || {};
    const base = e.skill * e.productivity * moraleMul * dm * crowd;
    for (const k of OUTPUT_KEYS) {
      const r = (role.output[k] || 0) + (spec[k] || 0);
      if (!r) continue;
      const v = base * r;
      out[k] += v;
      byDept[e.dept][k] += v;
    }
  }

  out.eng *= mul(mods, 'devSpeed');
  out.sales *= mul(mods, 'sales');
  out.marketing *= mul(mods, 'marketing');
  out.support *= mul(mods, 'support');

  const payrollDay = sum(state.employees, (e) => e.salary) / 365 * mul(mods, 'payroll', -0.6);
  return { out, byDept, payrollDay, crowd, capacity };
}

export function officeMoraleTarget(state, mods) {
  const tier = tierById(state.office.tier);
  const { capacity } = deskPressure(state, mods);
  const crowding = clamp((state.employees.length - capacity) / Math.max(1, capacity), 0, 1) * 0.35;
  return clamp((tier?.moraleBase ?? 0.55) + flat(mods, 'moraleGain') - crowding, 0.1, 1.05);
}

export function tickWorkforce(state, mods, days, log) {
  const target = officeMoraleTarget(state, mods);
  const mentor = state.employees.some((e) => e.specialty === 'mentor') ? 1.35 : 1;
  const churnBase = 0.0030 * mul(mods, 'staffChurn', -0.9);

  for (const e of state.employees) {
    const under = e.salary > 0 && e.salary < marketSalary(e.role, e.skill) * 0.92 ? 0.12 : 0;
    e.morale = clamp(e.morale + (target - under - e.morale) * clamp(0.14 * days, 0, 1), 0, 1.1);
    e.experience += 0.02 * days * mentor;
    e.productivity = Math.min(1.5, e.productivity + 0.0025 * days * mentor);
    if (e.experience > 12 && e.skill < 12) { e.skill = Math.round((e.skill + 0.5) * 10) / 10; e.experience = 0; }
  }

  // Attrition. The founder never quits.
  const risky = state.employees.filter((e) => e.id !== 'founder');
  for (const e of risky) {
    const p = churnBase * (1.9 - clamp(e.morale, 0, 1.1) * 1.4);
    if (chance(state.rng, perDay(Math.max(0, p), days))) {
      removeEmployee(state, e.id);
      log?.(`${e.name} (${roleById(e.role).name}) resigned.`, 'bad');
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
  state.employees.push(e);
  return { ok: true, employee: e };
}

export function fire(state, id) {
  const e = state.employees.find((x) => x.id === id);
  if (!e || e.id === 'founder') return { ok: false, reason: 'Cannot let the founder go.' };
  const severance = Math.round(e.salary / 12);
  state.company.cash -= severance;
  removeEmployee(state, id);
  for (const other of state.employees) other.morale = clamp(other.morale - 0.05, 0, 1.1);
  return { ok: true, severance };
}

export function promote(state, id) {
  const e = state.employees.find((x) => x.id === id);
  if (!e) return { ok: false, reason: 'Not found.' };
  const ladder = { engineer: 'senior_engineer', support_specialist: 'pm', sales_rep: 'manager', senior_engineer: 'manager' };
  const next = ladder[e.role];
  if (!next) return { ok: false, reason: 'No promotion path from this role.' };
  const role = roleById(next);
  if (e.skill < role.skill[0]) return { ok: false, reason: `Needs skill ${role.skill[0]}+ (has ${e.skill}).` };
  e.role = next;
  e.isManager = next === 'manager';
  e.salary = marketSalary(next, e.skill);
  e.morale = clamp(e.morale + 0.15, 0, 1.1);
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
