import { EVENTS, eventById } from '../data/events.js';
import { stageOrder } from '../data/stages.js';
import { clamp, uid, sum } from './util.js';
import { rnd, chance, perDay, pick, range, weighted } from './rng.js';
import { addBoost } from './modifiers.js';
import { liveProducts, totalCustomers, queueProject, suggestProject } from './products.js';
import { makeCandidate, refreshCandidates } from './state.js';
import { addContract } from './economy.js';
import { removeEmployee, marketSalary } from './workforce.js';
import { startOutage } from './infra.js';

const MIN_GAP = [3, 7];   // game days between events

export function eligibleEvents(state) {
  const order = stageOrder(state.company.stage);
  return EVENTS.filter((e) => {
    if (e.minStage && order < stageOrder(e.minStage)) return false;
    if (e.maxStage && order > stageOrder(e.maxStage)) return false;
    if (state.events.pending.some((p) => p.eventId === e.id)) return false;
    if (e.cond && !e.cond(state)) return false;
    return true;
  });
}

function subjectFor(state, def) {
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

export function spawnEvent(state, eventId) {
  const def = eventById(eventId);
  if (!def) return null;
  const pending = {
    id: uid('evt'),
    eventId,
    day: state.time.day,
    expiresDay: state.time.day + (def.expires || 3),
    subject: subjectFor(state, def)
  };
  state.events.pending.push(pending);
  state.events.seen[eventId] = (state.events.seen[eventId] || 0) + 1;
  return pending;
}

export function eventText(state, pending) {
  const def = eventById(pending.eventId);
  state.pendingEventSubject = pending.subject;
  const t = def.text ? def.text(state) : '';
  state.pendingEventSubject = null;
  return t;
}

export function choiceCost(state, choice) {
  return typeof choice.cost === 'function' ? Math.round(choice.cost(state)) : (choice.cost || 0);
}

export function resolveEvent(state, mods, pendingId, choiceId, log, extra = {}) {
  const i = state.events.pending.findIndex((p) => p.id === pendingId);
  if (i < 0) return { ok: false, reason: 'Event already resolved.' };
  const pending = state.events.pending[i];
  const def = eventById(pending.eventId);
  const choice = def.choices.find((c) => c.id === choiceId);
  if (!choice) return { ok: false, reason: 'Unknown choice.' };
  const cost = choiceCost(state, choice);
  if (cost > state.company.cash) return { ok: false, reason: 'Not enough cash.' };

  state.events.pending.splice(i, 1);
  state.company.cash -= cost;
  state.pendingEventSubject = pending.subject;

  const api = makeApi(state, mods, log, pending, extra);
  if (choice.apply) choice.apply({ state, mods, api, pending, extra });
  state.pendingEventSubject = null;
  state.events.log.unshift({ day: state.time.day, title: def.title, choice: choice.label });
  state.events.log = state.events.log.slice(0, 60);
  return { ok: true, cost };
}

export function tickEvents(state, mods, days, log) {
  state.events.cooldown -= days;
  if (state.events.cooldown <= 0 && state.events.pending.length < 3) {
    const pool = eligibleEvents(state);
    // Repeats are damped so the inbox does not loop the same three events.
    const chosen = weighted(state.rng, pool, (e) => (e.weight || 1) / (1 + (state.events.seen[e.id] || 0) * 0.6));
    if (chosen) {
      spawnEvent(state, chosen.id);
      log?.(`Event: ${chosen.title}`, 'event');
    }
    state.events.cooldown = range(state.rng, MIN_GAP[0], MIN_GAP[1]);
  }
  // Unattended events resolve to the conservative default.
  for (const p of state.events.pending.slice()) {
    if (state.time.day < p.expiresDay) continue;
    const def = eventById(p.eventId);
    const auto = def.choices.find((c) => c.id === def.auto) || def.choices[def.choices.length - 1];
    const affordable = (c) => !c.minigame && choiceCost(state, c) <= state.company.cash;
    const choice = affordable(auto) ? auto
      : def.choices.filter(affordable).sort((a, b) => choiceCost(state, a) - choiceCost(state, b))[0];
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
    dilute: (pct) => { state.company.founderEquity *= (1 - pct); }
  };
}

export { makeApi };
