import { DEPT_PERKS, SYNERGIES, FOUNDER_ACTIONS, founderActionById } from '../data/org.js';
import { stageOrder } from '../data/stages.js';
import { clamp } from './util.js';
import { chance } from './rng.js';
import { addBoost } from './modifiers.js';

export function deptCounts(state) {
  const c = { engineering: 0, product: 0, sales: 0, marketing: 0, support: 0, infra: 0 };
  for (const e of state.employees) {
    if (e.id === 'founder' || e.isManager) continue;
    if ((e.leaveUntil || 0) > state.time.day) continue;
    c[e.dept] = (c[e.dept] || 0) + 1;
  }
  return c;
}

/** Every department perk with whether it is active, for the UI and for mods. */
export function deptPerks(state) {
  const counts = deptCounts(state);
  const out = [];
  for (const [dept, perks] of Object.entries(DEPT_PERKS)) {
    const managed = !!state.departments?.[dept]?.managerId;
    for (const p of perks) {
      const active = (counts[dept] || 0) >= p.size && (!p.manager || managed);
      out.push({ ...p, dept, active, have: counts[dept] || 0, managed });
    }
  }
  return out;
}

export function activeSynergies(state) {
  const counts = deptCounts(state);
  return SYNERGIES.map((s) => ({ ...s, active: !!s.ok(counts) }));
}

/** Modifier bag from active perks and synergies. Merged by computeMods. */
export function orgMods(state) {
  const out = {};
  const add = (m) => { for (const [k, v] of Object.entries(m)) out[k] = (out[k] || 0) + v; };
  for (const p of deptPerks(state)) if (p.active) add(p.mods);
  for (const s of activeSynergies(state)) if (s.active) add(s.mods);
  return out;
}

// ------------------------------------------------------------ founder actions
export function ensureFounderActions(state) {
  if (!state.founderActions || typeof state.founderActions !== 'object') state.founderActions = { ready: {}, used: 0 };
  if (!state.founderActions.ready || typeof state.founderActions.ready !== 'object') state.founderActions.ready = {};
  if (!Number.isFinite(state.founderActions.used)) state.founderActions.used = 0;
  return state.founderActions;
}

export function founderActionStatus(state) {
  const fa = ensureFounderActions(state);
  const order = stageOrder(state.company.stage);
  const founder = state.employees.find((e) => e.id === 'founder');
  const away = founder && (founder.leaveUntil || 0) > state.time.day;
  return FOUNDER_ACTIONS.map((a) => {
    const readyAt = fa.ready[a.id] || 0;
    const locked = order < stageOrder(a.minStage);
    const cooling = readyAt > state.time.day;
    const noProduct = (a.hype || a.debt) && !state.products.some((p) => p.stage === 'live');
    return {
      ...a, readyAt, locked, cooling,
      available: !locked && !cooling && !away && !noProduct && !state.exitResult,
      reason: locked ? `Unlocks at the ${a.minStage} stage` : away ? 'You are on leave'
        : noProduct ? 'Needs a live product' : cooling ? 'Recharging' : null
    };
  });
}

export function useFounderAction(state, id, log) {
  const a = founderActionById(id);
  if (!a) return { ok: false, reason: 'Unknown action.' };
  const st = founderActionStatus(state).find((x) => x.id === id);
  if (!st.available) return { ok: false, reason: st.reason || 'Not available.' };
  const fa = ensureFounderActions(state);
  fa.ready[id] = state.time.day + a.cooldown;
  fa.used += 1;
  const founder = state.employees.find((e) => e.id === 'founder');
  const liveP = state.products.filter((p) => p.stage === 'live');
  const top = liveP.slice().sort((x, y) => y.users - x.users)[0];
  let msg = `${a.name}.`;
  if (a.mods) addBoost(state, `founder_${a.id}`, a.mods, a.days || 1, a.name);
  if (a.founderEnergy && founder) founder.energy = clamp((founder.energy ?? 0.9) + a.founderEnergy, 0, 1);
  if (a.morale) for (const e of state.employees) e.morale = clamp(e.morale + a.morale, 0, 1.1);
  if (a.energy) for (const e of state.employees) e.energy = clamp((e.energy ?? 0.9) + a.energy, 0, 1);
  if (a.debt && top) {
    const busiest = liveP.slice().sort((x, y) => y.techDebt - x.techDebt)[0];
    busiest.techDebt = clamp(busiest.techDebt + a.debt, 0, 3);
    msg = `Code cleanup on ${busiest.name}: debt down.`;
  }
  if (a.hype && top) {
    if (chance(state.rng, a.backfire || 0)) {
      state.company.reputation = clamp(state.company.reputation - 0.05, 0.2, 60);
      msg = 'The tweetstorm backfired. Screenshots are circulating.';
    } else {
      const cur = top.hype && top.hype.until > state.time.day ? top.hype : null;
      top.hype = { until: Math.max(cur?.until || 0, state.time.day + (a.days || 3)), acq: Math.max(cur?.acq || 0, a.hype), label: 'Founder tweetstorm' };
      msg = `Your thread about ${top.name} took off.`;
    }
  }
  if (a.fundingBonus) {
    state.funding.bonus = Math.max(state.funding.bonus || 1, a.fundingBonus);
    msg = 'Coffee with investors. The next round will be priced a little higher.';
  }
  log?.(msg, 'good');
  return { ok: true, message: msg };
}
