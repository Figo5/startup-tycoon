import { EVENTS, eventById, TRIGGERS, choiceLabel } from '../data/events.js';
import { stageOrder } from '../data/stages.js';
import { clamp, uid, sum } from './util.js';
import { rnd, chance, perDay, pick, range, weighted } from './rng.js';
import { addBoost } from './modifiers.js';
import { liveProducts, totalCustomers, queueProject, suggestProject } from './products.js';
import { makeCandidate, refreshCandidates, addStory, applyTraits, traitList } from './state.js';
import { traitById } from '../data/traits.js';
import { addContract } from './economy.js';
import { removeEmployee, marketSalary, sendOnLeave, recordAlumnus, fairSalary } from './workforce.js';
import { startOutage } from './infra.js';
import { diluteFounder } from './equity.js';

/**
 * Stage-aware event cadence. A solo founder is left alone to learn the game;
 * a larger company generates more decisions per day because there is more of it
 * to go wrong. `damp` is how hard an event the player has already seen is
 * suppressed, so late runs stay varied instead of looping three favourites.
 */
const CADENCE = {
  solo: { gap: [4.2, 7.0], cap: 2, damp: 0.50 },
  tiny: { gap: [3.6, 6.2], cap: 2, damp: 0.55 },
  seed: { gap: [3.1, 5.2], cap: 3, damp: 0.60 },
  growing: { gap: [2.7, 4.5], cap: 3, damp: 0.72 },
  scaleup: { gap: [2.5, 4.1], cap: 3, damp: 0.88 },
  major: { gap: [2.2, 3.6], cap: 4, damp: 1.00 },
  late: { gap: [2.0, 3.3], cap: 4, damp: 1.15 }
};
/** Hard ceiling on unresolved events, whatever the cadence says. */
export const MAX_UNRESOLVED = 4;
/** Categories the later stages weight differently: bigger, less personal. */
const CAT_STAGE_MUL = {
  scaleup: { money: 1.20, legal: 1.20, people: 0.85 },
  major: { money: 1.30, legal: 1.30, market: 1.15, people: 0.75 },
  late: { money: 1.35, legal: 1.35, market: 1.20, people: 0.70 }
};
const RECENT_CATS = 3;

export function cadenceFor(state) {
  const base = CADENCE[state.company.stage] || CADENCE.tiny;
  return { ...base, catMul: CAT_STAGE_MUL[state.company.stage] || {} };
}

export function eligibleEvents(state) {
  const order = stageOrder(state.company.stage);
  return EVENTS.filter((e) => {
    if (e.minStage && order < stageOrder(e.minStage)) return false;
    if (e.maxStage && order > stageOrder(e.maxStage)) return false;
    if (e.chainOnly || e.trigger) return false;
    if (state.events.pending.some((p) => p.eventId === e.id)) return false;
    if (e.cond && !e.cond(state)) return false;
    return true;
  });
}

function subjectFor(state, def) {
  // Newer events pick their own subject: a person, a rival, a product.
  if (typeof def.subject === 'function') return def.subject(state) || null;
  if (def.id === 'resignation' || def.id === 'poaching') {
    const staff = state.employees.filter((e) => e.id !== 'founder');
    return staff.length ? pick(state.rng, staff).name : 'One of your team';
  }
  if (def.id.startsWith('competitor')) {
    const alive = state.competitors.filter((c) => c.alive && !c.acquired);
    return alive.length ? pick(state.rng, alive).name : 'A rival';
  }
  return null;
}

export function spawnEvent(state, eventId, opts = null) {
  const def = eventById(eventId);
  if (!def) return null;
  let subj = opts || subjectFor(state, def);
  if (typeof subj === 'string') subj = { name: subj };
  const pending = {
    id: uid('evt'),
    eventId,
    day: state.time.day,
    expiresDay: state.time.day + (def.expires || 3),
    subject: subj?.name ?? null,
    subjectId: subj?.id ?? null,
    data: subj?.data ?? null
  };
  state.events.pending.push(pending);
  state.events.seen[eventId] = (state.events.seen[eventId] || 0) + 1;
  state.events.lastEventId = eventId;
  const cats = state.events.recentCats;
  if (Array.isArray(cats)) {
    cats.push(def.cat || 'other');
    if (cats.length > RECENT_CATS) cats.splice(0, cats.length - RECENT_CATS);
  }
  return pending;
}

/**
 * Weighted draw. Three dampers, in order of how badly they ruined a run:
 * an immediate repeat of the last event, repeats of anything seen before, and a
 * category that has just fired (so the inbox does not become three variations
 * of the same problem).
 */
export function pickEvent(state, cadence) {
  const cats = Array.isArray(state.events.recentCats) ? state.events.recentCats : [];
  const catCount = (cat) => cats.filter((c) => c === cat).length;
  const pool = eligibleEvents(state).filter((e) => e.id !== state.events.lastEventId);
  return weighted(state.rng, pool, (e) => {
    const seen = state.events.seen[e.id] || 0;
    const repeat = 1 / (1 + seen * 0.6 * cadence.damp);
    const cat = 1 / (1 + catCount(e.cat || 'other') * 0.9);
    const stageMul = cadence.catMul?.[e.cat] ?? 1;
    return (e.weight || 1) * repeat * cat * stageMul;
  });
}

export function eventText(state, pending) {
  const def = eventById(pending.eventId);
  state.pendingEventSubject = pending.subject;
  state.pendingEvent = pending;
  let t = '';
  try { t = def.text ? def.text(state, pending) : ''; } finally {
    state.pendingEventSubject = null;
    state.pendingEvent = null;
  }
  return t;
}

/** Choices can be hidden when they make no sense right now (`show`). */
export function visibleChoices(state, def, pending) {
  return def.choices.filter((c) => !c.show || c.show(state, pending));
}

/** Runs `fn` with the event's subject in scope, for text, labels and costs. */
export function withPending(state, pending, fn) {
  const prevS = state.pendingEventSubject;
  const prevP = state.pendingEvent;
  state.pendingEventSubject = pending?.subject ?? null;
  state.pendingEvent = pending || null;
  try { return fn(); } finally {
    state.pendingEventSubject = prevS;
    state.pendingEvent = prevP;
  }
}

export function choiceCost(state, choice, pending = null) {
  if (typeof choice.cost !== 'function') return choice.cost || 0;
  const v = pending ? withPending(state, pending, () => choice.cost(state)) : choice.cost(state);
  return Math.round(Number.isFinite(v) ? v : 0);
}

export function labelFor(state, choice, pending) {
  return withPending(state, pending, () => choiceLabel(state, choice));
}

export function resolveEvent(state, mods, pendingId, choiceId, log, extra = {}) {
  const i = state.events.pending.findIndex((p) => p.id === pendingId);
  if (i < 0) return { ok: false, reason: 'Event already resolved.' };
  const pending = state.events.pending[i];
  const def = eventById(pending.eventId);
  const choice = def.choices.find((c) => c.id === choiceId);
  if (!choice) return { ok: false, reason: 'Unknown choice.' };
  const cost = choiceCost(state, choice, pending);
  if (cost > state.company.cash) return { ok: false, reason: 'Not enough cash.' };
  const label = labelFor(state, choice, pending);

  state.events.pending.splice(i, 1);
  state.company.cash -= cost;
  state.pendingEventSubject = pending.subject;
  state.pendingEvent = pending;

  const api = makeApi(state, mods, log, pending, extra);
  try {
    if (choice.apply) choice.apply({ state, mods, api, pending, extra });
  } finally {
    state.pendingEventSubject = null;
    state.pendingEvent = null;
  }
  state.events.log.unshift({ day: state.time.day, title: def.title, choice: label });
  state.events.log = state.events.log.slice(0, 60);
  return { ok: true, cost };
}

/** Follow-ups scheduled by earlier choices, plus reactions to things that just happened. */
function tickScheduled(state, log) {
  const ev = state.events;
  if (!Array.isArray(ev.scheduled)) ev.scheduled = [];
  const due = ev.scheduled.filter((x) => x.day <= state.time.day);
  for (const x of due) {
    if (ev.pending.length >= MAX_UNRESOLVED) break;
    ev.scheduled = ev.scheduled.filter((y) => y !== x);
    const def = eventById(x.eventId);
    if (!def) continue;
    if (def.cond && !def.cond(state, x)) continue;
    spawnEvent(state, x.eventId, { name: x.subject, id: x.subjectId, data: x.data });
    log?.(`Event: ${def.title}`, 'event');
  }
  for (const t of TRIGGERS) {
    if (ev.pending.length >= MAX_UNRESOLVED) break;
    if (ev.pending.some((p) => p.eventId === t.event)) continue;
    const last = ev.lastTriggered?.[t.event] ?? -999;
    if (state.time.day - last < (t.cooldown || 20)) continue;
    const opts = t.check(state);
    if (!opts) continue;
    if (!ev.lastTriggered) ev.lastTriggered = {};
    ev.lastTriggered[t.event] = state.time.day;
    spawnEvent(state, t.event, opts);
    log?.(`Event: ${eventById(t.event).title}`, 'event');
  }
}

export function tickEvents(state, mods, days, log) {
  const cadence = cadenceFor(state);
  if (state.time.day > 1) tickScheduled(state, log);
  state.events.cooldown -= days;
  // Never bank a backlog: without this floor, a full inbox quietly accrues
  // negative cooldown and then empties itself all at once.
  if (state.events.cooldown < 0) state.events.cooldown = 0;
  if (state.events.cooldown <= 0 && state.events.pending.length < Math.min(cadence.cap, MAX_UNRESOLVED)) {
    const chosen = pickEvent(state, cadence);
    if (chosen) {
      spawnEvent(state, chosen.id);
      log?.(`Event: ${chosen.title}`, 'event');
    }
    state.events.cooldown = range(state.rng, cadence.gap[0], cadence.gap[1]);
  }
  // Unattended events resolve to the conservative default.
  for (const p of state.events.pending.slice()) {
    if (state.time.day < p.expiresDay) continue;
    const def = eventById(p.eventId);
    const shown = visibleChoices(state, def, p);
    const auto = shown.find((c) => c.id === def.auto) || shown[shown.length - 1] || def.choices[def.choices.length - 1];
    const affordable = (c) => !c.minigame && choiceCost(state, c, p) <= state.company.cash;
    const choice = affordable(auto) ? auto
      : shown.filter(affordable).sort((a, b) => choiceCost(state, a, p) - choiceCost(state, b, p))[0];
    if (choice) { resolveEvent(state, mods, p.id, choice.id, log); continue; }
    // Every option costs more than the company has. Let it lapse rather than
    // leave it pending forever, holding an inbox slot against the cap.
    state.events.pending = state.events.pending.filter((x) => x.id !== p.id);
    state.events.log.unshift({ day: state.time.day, title: def.title, choice: 'Lapsed' });
    state.events.log = state.events.log.slice(0, 60);
    log?.(`${def.title} lapsed - there was nothing you could afford to do.`, 'event');
  }
}

function makeApi(state, mods, log, pending, extra) {
  const note = (text) => log?.(text, 'event');
  const biggest = () => liveProducts(state).sort((a, b) => b.revenueDay - a.revenueDay)[0] || null;
  return {
    note,
    chance: (p) => chance(state.rng, p),
    rand: (a, b) => range(state.rng, a, b),
    addCash: (v) => { state.company.cash += v; },
    spend: (v) => { state.company.cash = Math.max(0, state.company.cash - v); },
    addReputation: (v) => { state.company.reputation = clamp(state.company.reputation + v, 0.2, 60); },
    addUsers: (product, n) => { if (product) product.users += n; },
    morale: (v) => { for (const e of state.employees) e.morale = clamp(e.morale + v, 0, 1.1); },
    boost: (id, m, days) => addBoost(state, id, m, days, id),
    engPenalty: (d) => addBoost(state, 'firefight', { devSpeed: -0.5 }, d * 2, 'Firefighting'),
    qualityHit: (v) => { const p = biggest(); if (p) p.quality = clamp(p.quality - v, 0, 1); },
    churnSpike: (amount, days) => addBoost(state, 'churnspike', { churn: amount }, days, 'Churn spike'),
    security: (v) => { for (const p of state.products) p.security = clamp(p.security + v, 0, 1); },
    infraCoverage: () => clamp(state.infra.reliability, 0, 1),
    endOutage: (factor) => {
      for (const p of state.products) if (p.outage > 0) p.outage *= clamp(factor, 0, 3);
    },
    startOutage: () => { const p = biggest(); if (p) startOutage(state, mods, p, log); },
    spawnCandidate: (opts) => {
      const before = state.candidates.length;
      refreshCandidates(state, 1);
      const c = state.candidates[state.candidates.length - 1];
      if (c && opts?.star) { c.star = true; c.skill = Math.round(Math.min(12, c.skill + 2.5) * 10) / 10; c.salary = Math.round(c.salary * 1.35); }
      if (c && opts?.referral) c.signingBonus = 0;
      return c;
    },
    retainEmployee: (pct) => {
      const e = state.employees.find((x) => x.name === pending.subject);
      if (e) { e.salary = Math.round(e.salary * (1 + pct)); e.morale = clamp(e.morale + 0.25, 0, 1.1); }
    },
    loseEmployee: () => {
      const e = state.employees.find((x) => x.name === pending.subject && x.id !== 'founder')
        || state.employees.filter((x) => x.id !== 'founder')[0];
      if (e) { removeEmployee(state, e.id); log?.(`${e.name} left the company.`, 'bad'); }
    },
    raiseSalaries: (pct) => { for (const e of state.employees) if (e.salary > 0) e.salary = Math.round(e.salary * (1 + pct)); },
    addContract: (opts) => {
      const c = addContract(state, mods, { name: pending.subject || 'Enterprise Customer', ...opts });
      note(`Signed ${c.name} at $${Math.round(c.revenueDay).toLocaleString()}/day${c.sla ? ' with an SLA' : ''}.`);
      return c;
    },
    dropContract: () => {
      const c = state.contracts.sort((a, b) => b.revenueDay - a.revenueDay)[0];
      if (c) state.contracts = state.contracts.filter((x) => x.id !== c.id);
    },
    discountContract: (pct) => {
      const c = state.contracts.sort((a, b) => b.revenueDay - a.revenueDay)[0];
      if (c) { c.revenueDay *= (1 - pct); c.remaining += 365; }
    },
    spawnFundingOffer: (bonus) => { state.funding.bonus = Math.max(state.funding.bonus || 1, bonus); },
    spawnExitOffer: () => { state.flags.unlocked.push('exit_offer'); },
    queuePriority: (typeId) => {
      const p = biggest();
      if (!p) return;
      const r = queueProject(state, mods, p.id, typeId);
      if (!r.ok) { const s = suggestProject(state, mods, p); if (s) queueProject(state, mods, p.id, s.id); }
    },
    rivalShare: (v) => {
      for (const c of state.competitors) for (const mk of c.markets) c.shares[mk] = clamp((c.shares[mk] || 0) + v / c.markets.length, 0, 0.6);
    },
    stealShare: (v) => {
      for (const c of state.competitors) for (const mk of c.markets) c.shares[mk] = clamp((c.shares[mk] || 0) - v, 0, 0.6);
    },
    halveMarketing: () => { state.company.marketingBudget = Math.round(state.company.marketingBudget * 0.5); },
    // --- people -----------------------------------------------------------
    employee: () => state.employees.find((x) => x.id === pending.subjectId)
      || state.employees.find((x) => x.name === pending.subject) || null,
    employeeById: (id) => state.employees.find((x) => x.id === id) || null,
    story: (e, text) => addStory(e, state.time.day, text),
    moraleOf: (e, v) => { if (e) e.morale = clamp(e.morale + v, 0, 1.1); },
    energy: (v) => { for (const e of state.employees) e.energy = clamp((e.energy ?? 0.9) + v, 0, 1); },
    energyOf: (e, v) => { if (e) e.energy = clamp((e.energy ?? 0.9) + v, 0, 1); },
    leave: (e, d = 5) => (e ? sendOnLeave(state, e.id, d) : null),
    raiseOf: (e, pct) => { if (e && e.salary > 0) { e.salary = Math.round(e.salary * (1 + pct)); e.promotedDay = state.time.day; } },
    addTrait: (e, id) => {
      if (!e || !traitById(id)) return false;
      if (!Array.isArray(e.traits)) e.traits = [];
      if (e.traits.includes(id) || e.traits.length >= 2) return false;
      e.traits.push(id);
      return true;
    },
    lose: (e, rival = null) => {
      if (!e || e.id === 'founder') return;
      removeEmployee(state, e.id);
      recordAlumnus(state, e, rival ? `joined ${rival.name}` : 'resigned');
      if (rival) { rival.strength = clamp(rival.strength + 0.03, 0.02, 1.2); rival.rivalry = clamp((rival.rivalry || 0) + 0.1, 0, 1); }
      log?.(`${e.name} left the company${rival ? ` for ${rival.name}` : ''}.`, 'bad');
    },
    candidate: (opts = {}) => {
      const roles = opts.role ? [opts.role] : null;
      const c = makeCandidate(state.rng, opts.role || (roles ? roles[0] : pick(state.rng, ['engineer', 'senior_engineer', 'designer', 'marketer', 'sales_rep'])), {
        hiredDay: state.time.day, star: !!opts.star, stage: stageOrder(state.company.stage), referral: !!opts.referral
      });
      if (opts.trait) applyTraits(c, [opts.trait, ...(c.traits || []).filter((t) => t !== opts.trait)].slice(0, opts.star ? 2 : 1));
      if (opts.name) c.name = opts.name;
      if (opts.skill) c.skill = Math.round(Math.min(12, opts.skill) * 10) / 10;
      if (opts.salaryMul) c.salary = Math.round((c.salary * opts.salaryMul) / 500) * 500;
      if (opts.referral) c.signingBonus = 0;
      if (opts.traits) c.traits = opts.traits.slice(0, 2);
      c.expiresDay = state.time.day + (opts.days || 8);
      state.candidates.push(c);
      return c;
    },
    setPace: (id) => { if (['relaxed', 'normal', 'crunch'].includes(id)) state.company.pace = id; },
    // --- products ---------------------------------------------------------
    product: () => state.products.find((x) => x.id === pending.data?.productId) || biggest(),
    hype: (p, acq, d, label = 'Buzz') => {
      if (!p) return;
      const cur = p.hype && p.hype.until > state.time.day ? p.hype : null;
      p.hype = { until: Math.max(cur?.until || 0, state.time.day + d), acq: Math.max(cur?.acq || 0, acq), label };
    },
    queueOn: (p, typeId) => (p ? queueProject(state, mods, p.id, typeId) : { ok: false }),
    discountCategory: (cat, pct, d) => { state.productDiscount = { cat, pct, until: state.time.day + d }; },
    // --- rivals and follow-ups -------------------------------------------
    rival: () => state.competitors.find((x) => x.id === pending.data?.rivalId) || null,
    rivalHit: (r, strength, share = 0) => {
      if (!r) return;
      r.strength = clamp(r.strength + strength, 0.02, 1.2);
      if (share) for (const mk of r.markets) r.shares[mk] = clamp((r.shares[mk] || 0) + share, 0, 0.5);
      if (strength < 0) r.valuation *= 1 + strength;
    },
    chain: (eventId, d, opts = {}) => {
      if (!Array.isArray(state.events.scheduled)) state.events.scheduled = [];
      state.events.scheduled.push({
        eventId, day: state.time.day + d,
        subject: opts.subject ?? pending.subject, subjectId: opts.subjectId ?? pending.subjectId,
        data: opts.data ?? pending.data
      });
    },
    // Ownership always moves through the one transaction path.
    dilute: (pct, source = 'event') => diluteFounder(state, pct, source)
  };
}

export { makeApi };
