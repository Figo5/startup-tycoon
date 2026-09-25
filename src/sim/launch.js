// Launches. Anything customers can see gets a launch roll when it ships, so
// shipping is a moment rather than a silent +0.11 quality. The roll is mostly
// earned - quality, polish, the people who built it, marketing behind it and
// the market it lands in - with enough luck left that a Hit feels like one.

import { clamp } from './util.js';
import { rnd, range } from './rng.js';
import { LAUNCHABLE, LAUNCH_OUTCOMES, approachById, projectTypeById } from '../data/products.js';
import { traitList, addStory } from './state.js';
import { flat } from './modifiers.js';
import { trendFor } from './market.js';

/** Picks who gets the credit: an engineer (or product person), weighted by output. */
export function pickLead(state, wf, product) {
  const pool = state.employees.filter((e) => ['engineering', 'product'].includes(e.dept) && !e.isManager);
  if (!pool.length) return null;
  const weights = pool.map((e) => Math.max(0.05, wf?.byPerson?.get(e.id) ?? e.skill));
  let total = weights.reduce((a, b) => a + b, 0);
  let r = rnd(state.rng) * total;
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

/** Everything that shifts a launch, as a list the UI can show. */
export function launchFactors(state, mods, p, prj, lead) {
  const type = projectTypeById(prj.typeId);
  const ap = approachById(prj.approach);
  const f = [];
  f.push(['Product quality', p.quality * 0.75]);
  if (ap.launch) f.push([`${ap.name} approach`, ap.launch]);
  if (type?.launch) f.push([type.name, type.launch]);
  let traitBonus = 0;
  for (const t of traitList(lead)) traitBonus += t.effects.launch || 0;
  // A hype machine anywhere in the building helps, at half strength.
  for (const e of state.employees) {
    if (e === lead) continue;
    for (const t of traitList(e)) if (t.id === 'hype') traitBonus += 0.1;
  }
  if (traitBonus) f.push(['The team', Math.min(0.35, traitBonus)]);
  const mkt = clamp(state.company.marketingBudget / Math.max(400, state.stats.revenueDay || 0), 0, 1) * 0.12;
  if (mkt > 0.005) f.push(['Marketing push', mkt]);
  if (p.techDebt > 0.6) f.push(['Technical debt', -Math.min(0.2, (p.techDebt - 0.6) * 0.2)]);
  if (p.outage > 0) f.push(['Launching during an outage', -0.25]);
  const trend = trendFor(state, p.category);
  if (trend) f.push([trend.name, trend.launch || 0]);
  const research = flat(mods, 'launch');
  if (research) f.push(['Launch playbooks', research]);
  return f;
}

export function rollLaunch(state, mods, p, prj, lead, log) {
  if (!LAUNCHABLE.has(prj.typeId)) return null;
  const factors = launchFactors(state, mods, p, prj, lead);
  const base = factors.reduce((a, [, v]) => a + v, 0);
  const luck = range(state.rng, -0.22, 0.22);
  const score = base + luck;
  const outcome = LAUNCH_OUTCOMES.find((o) => score < o.below);
  const day = state.time.day;
  const isMvp = prj.typeId === 'mvp';
  const label = `${p.name} ${isMvp ? 'launch' : prj.name}`;

  if (outcome.id === 'flop') {
    state.company.reputation = clamp(state.company.reputation - 0.05, 0.2, 60);
    if (!isMvp) p.users *= 0.97;
    for (const e of state.employees) e.morale = clamp(e.morale - 0.03, 0, 1.1);
    log?.(`${label} flopped. Reviews were unkind.`, 'bad');
  } else if (outcome.id === 'solid') {
    log?.(`${label} landed solidly.`, 'good');
  } else if (outcome.id === 'hit') {
    p.hype = { until: day + 10, acq: 0.3, label: 'Hit launch' };
    state.company.reputation = clamp(state.company.reputation + 0.05, 0.2, 60);
    for (const e of state.employees) e.morale = clamp(e.morale + 0.04, 0, 1.1);
    log?.(`${label} is a HIT. Sign-ups are surging.`, 'launch');
  } else {
    p.hype = { until: day + 8, acq: 0.8, label: 'Went viral' };
    p.users += p.users * 0.08 + (isMvp ? 400 : 1500);
    state.company.reputation = clamp(state.company.reputation + 0.15, 0.2, 60);
    for (const e of state.employees) e.morale = clamp(e.morale + 0.08, 0, 1.1);
    log?.(`${label} went VIRAL. Everyone is talking about ${p.name}.`, 'launch');
  }
  if (lead && lead.id !== 'founder' && (outcome.id === 'hit' || outcome.id === 'viral' || isMvp || prj.typeId === 'major')) {
    addStory(lead, day, `Led ${isMvp ? `the launch of ${p.name}` : `${prj.name} on ${p.name}`} (${outcome.name.toLowerCase()})`);
  }
  if (!Array.isArray(p.launches)) p.launches = [];
  p.launches.unshift({ day: Math.floor(day), name: prj.name, outcome: outcome.id, lead: lead?.name || null });
  if (p.launches.length > 8) p.launches.length = 8;
  const st = state.stats;
  if (!st.launches || typeof st.launches !== 'object') st.launches = { flop: 0, solid: 0, hit: 0, viral: 0 };
  st.launches[outcome.id] = (st.launches[outcome.id] || 0) + 1;
  state.lastLaunch = { day, outcome: outcome.id, product: p.id };
  return { outcome: outcome.id, score, factors };
}

/** Credits the lead on every completed project and rolls launches. */
export function settleCompleted(state, mods, wf, completed, log) {
  const out = [];
  for (const c of completed) {
    const lead = pickLead(state, wf, c.product);
    if (lead) lead.shipped = (lead.shipped || 0) + 1;
    const r = rollLaunch(state, mods, c.product, c.project, lead, log);
    out.push({ ...c, lead, launch: r });
  }
  return out;
}
