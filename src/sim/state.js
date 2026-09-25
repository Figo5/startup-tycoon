import { makeRng, rnd, range, int, pick, chance } from './rng.js';
import { clamp, uid } from './util.js';
import { PRODUCT_CATEGORIES, categoryById, CUSTOMER_CLASSES, approachById } from '../data/products.js';
import { ROLES, roleById, DEPARTMENTS, FIRST_NAMES, LAST_NAMES, SPECIALTIES } from '../data/roles.js';
import { COMPETITORS } from '../data/competitors.js';
import { OFFICE_TIERS } from '../data/office.js';
import { SCENARIOS, PRESTIGE_UPGRADES } from '../data/prestige.js';
import { stageOrder } from '../data/stages.js';
import { TRAITS, traitById } from '../data/traits.js';
import { emptyMarket } from './market.js';
import { makeRival } from './competitors.js';

export const SAVE_VERSION = 5;
export const REAL_SECONDS_PER_DAY = 120;   // 1 game day = 2 real minutes
export const OFFLINE_CAP_HOURS = 16;
export const MAX_OFFLINE_DAYS = (OFFLINE_CAP_HOURS * 3600) / REAL_SECONDS_PER_DAY;

export const PRODUCT_NAMES = ['Tabsy', 'Loomly', 'Perch', 'Kettle', 'Vellum', 'Northstar', 'Pindrop',
  'Grovel', 'Sable', 'Quartz', 'Hatchet', 'Mistral', 'Runlet', 'Beacon', 'Fathom', 'Lintel', 'Cobalt',
  'Wicker', 'Anvil', 'Petal', 'Origami', 'Ledger', 'Tidewater', 'Foxglove', 'Meridian', 'Halyard'];

export function emptyMeta() {
  return {
    version: SAVE_VERSION,
    founderRep: 0,          // unspent Founder Reputation
    lifetimeRep: 0,
    runs: [],               // {company, exit, value, rep, days, stage}
    upgrades: {},           // id -> level
    appliedTx: [],          // recent purchase transaction ids, so none can be replayed
    unlockedScenarios: ['standard'],
    achievements: []
  };
}

export function emptyAdvisors() {
  return { hired: [], slots: 1 };
}

export function emptyGoals() {
  return { offered: [], active: null, completed: [], offeredDay: -1 };
}

export function emptyAcquisitions() {
  return { targets: [], completed: [], integrationUntil: 0, assets: [] };
}

export function emptyRoadmap() {
  // `auto` is opt-in: a manager only plans work once the player asks for it,
  // because automatic initiatives otherwise act as a free multiplier.
  return { active: null, history: [], auto: false };
}

/**
 * Makes a meta bag safe to spend from. Clamps every level into its configured
 * [0, max] range, forbids a negative or non-finite reputation balance, and keeps
 * the applied-transaction ledger. Mutates and returns the same object so
 * references held by the UI stay valid.
 */
export function normalizeMeta(meta) {
  const m = (meta && typeof meta === 'object') ? meta : emptyMeta();
  const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  m.version = SAVE_VERSION;
  m.founderRep = Math.max(0, num(m.founderRep));
  m.lifetimeRep = Math.max(0, num(m.lifetimeRep));
  m.runs = Array.isArray(m.runs) ? m.runs.filter((r) => r && typeof r === 'object').slice(0, 25) : [];
  m.achievements = Array.isArray(m.achievements) ? m.achievements.filter((a) => typeof a === 'string') : [];
  m.appliedTx = Array.isArray(m.appliedTx) ? m.appliedTx.filter((t) => typeof t === 'string').slice(-50) : [];
  m.unlockedScenarios = Array.isArray(m.unlockedScenarios) ? m.unlockedScenarios.filter((s) => typeof s === 'string') : [];
  if (!m.unlockedScenarios.includes('standard')) m.unlockedScenarios.unshift('standard');
  const levels = {};
  for (const up of PRESTIGE_UPGRADES) {
    const raw = Number(m.upgrades?.[up.id]);
    levels[up.id] = clamp(Number.isFinite(raw) ? Math.floor(raw) : 0, 0, up.max);
  }
  m.upgrades = levels;
  return m;
}

export function metaEffects(meta) {
  const e = {};
  const add = (k, v) => { e[k] = (e[k] || 0) + v; };
  const m = meta && typeof meta === 'object' ? meta : {};
  for (const up of PRESTIGE_UPGRADES) {
    const raw = Number(m.upgrades?.[up.id]);
    const lvl = clamp(Number.isFinite(raw) ? Math.floor(raw) : 0, 0, up.max);
    if (!lvl) continue;
    for (const [k, v] of Object.entries(up.effect)) {
      if (typeof v === 'number') add(k, v * lvl);
      else if (Array.isArray(v)) e[k] = v.slice(0, lvl);
      else e[k] = v;
    }
  }
  return e;
}

export function randomName(rng) {
  return `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
}

export function makeEmployee(rng, roleId, opts = {}) {
  const role = roleById(roleId);
  const skillBonus = opts.skillBonus || 0;
  const skill = clamp(range(rng, role.skill[0], role.skill[1]) + skillBonus, 1, 12);
  const spec = opts.specialty !== undefined ? opts.specialty
    : (chance(rng, 0.35) ? pick(rng, SPECIALTIES).id : null);
  return {
    id: uid('emp'),
    name: opts.name || randomName(rng),
    role: roleId,
    dept: opts.dept || role.dept,
    salary: Math.round((role.salary * (0.9 + skill / 14) * (opts.salaryMul || 1)) / 500) * 500,
    skill: Math.round(skill * 10) / 10,
    productivity: Math.round(range(rng, 0.82, 1.18) * 100) / 100,
    experience: 0,
    morale: opts.morale ?? 0.75,
    specialty: spec,
    assignment: null,
    isManager: roleId === 'manager',
    hiredDay: opts.hiredDay ?? 0,
    desk: null,
    traits: Array.isArray(opts.traits) ? opts.traits.slice(0, 2) : [],
    energy: 0.9,
    story: [],
    shipped: 0,
    promotedDay: null,
    leaveUntil: 0,
    streak: 1
  };
}

// Traits that would describe the same person twice, or contradict each other.
const TRAIT_CONFLICTS = [['workhorse', 'steady'], ['social', 'diva'], ['frugal', 'veteran'],
  ['team_player', 'diva'], ['fast_learner', 'veteran']];
const conflicts = (a, b) => TRAIT_CONFLICTS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/**
 * Rolls 0-2 traits. Most people have one; stars always carry a rare or
 * legendary one. Legendary people only turn up once the company is known.
 */
export function rollTraits(rng, { star = false, stage = 0, legendaryBonus = 0 } = {}) {
  const out = [];
  const pickRarity = (forceRare) => {
    const leg = (stage >= 2 ? 0.03 : 0.004) + legendaryBonus + (forceRare ? 0.22 : 0);
    const r = rnd(rng);
    if (r < leg) return 'legendary';
    if (forceRare || r < leg + 0.17) return 'rare';
    return 'common';
  };
  const pickOne = (rarity) => {
    const pool = TRAITS.filter((t) => t.rarity === rarity && !out.includes(t.id) && !out.some((o) => conflicts(o, t.id)));
    return pool.length ? pick(rng, pool).id : null;
  };
  const roll = rnd(rng);
  const count = star ? (roll < 0.35 ? 2 : 1) : roll < 0.32 ? 0 : roll < 0.86 ? 1 : 2;
  for (let i = 0; i < count; i++) {
    const t = pickOne(pickRarity(star && i === 0));
    if (t) out.push(t);
  }
  return out;
}

export const traitList = (e) => (Array.isArray(e?.traits) ? e.traits.map(traitById).filter(Boolean) : []);
export const hasTrait = (e, id) => Array.isArray(e?.traits) && e.traits.includes(id);

/** A short, capped personal history: the thing that makes a name a person. */
export function addStory(e, day, text) {
  if (!e) return;
  if (!Array.isArray(e.story)) e.story = [];
  e.story.push({ day: Math.floor(day || 0), text });
  if (e.story.length > 8) e.story.splice(0, e.story.length - 8);
}

export function makeCandidate(rng, roleId, opts = {}) {
  const c = makeEmployee(rng, roleId, opts);
  c.id = uid('cand');
  c.star = !!opts.star;
  if (c.star) { c.skill = Math.round(Math.min(12, c.skill + 2.5) * 10) / 10; c.salary = Math.round(c.salary * 1.35); }
  applyTraits(c, rollTraits(rng, { star: c.star, stage: opts.stage || 0, legendaryBonus: opts.legendaryBonus || 0 }));
  c.signingBonus = opts.referral ? 0 : Math.round((c.salary * 0.06) / 100) * 100;
  c.expiresDay = 0; // set by caller
  return c;
}

/** Applies the one-time parts of a trait (skill, asking salary). */
export function applyTraits(c, traits) {
  c.traits = traits.slice(0, 2);
  let salaryMul = 1;
  for (const t of traitList(c)) {
    if (t.effects.skill) c.skill = Math.round(Math.min(12, c.skill + t.effects.skill) * 10) / 10;
    if (t.effects.salary) salaryMul += t.effects.salary;
  }
  c.salary = Math.round((c.salary * salaryMul) / 500) * 500;
  return c;
}

export function makeProduct(rng, categoryId, name) {
  const cat = categoryById(categoryId);
  return {
    id: uid('prd'),
    name: name || pick(rng, PRODUCT_NAMES),
    category: categoryId,
    stage: 'development',
    version: 1.0,
    users: 0,
    customers: { consumer: 0, smb: 0, midmarket: 0, enterprise: 0 },
    quality: 0.4,
    reliability: 0.85,
    techDebt: 0.05,
    reputation: 0,
    enterpriseReady: cat.enterprisePotential * 0.1,
    security: 0.4,
    infraEff: 0,
    marketBonus: 0,
    supportLoadMod: 0,
    priority: 1,            // 0.5 low / 1 normal / 2 high
    projects: [],
    completed: [],
    // A product roadmap: one initiative at a time, `history` gates one-time ones.
    roadmap: emptyRoadmap(),
    // Roadmap effects that have no existing home on the product record.
    acqMul: 0, revMul: 0, churnMul: 0, convMul: 0,
    revenueDay: 0,
    churnDay: 0,
    growthDay: 0,
    outage: 0,
    launchedDay: null,
    approach: 'standard',
    featuresSinceMajor: 0,
    hype: null,           // { until, acq, label } after a hit launch
    launches: []          // recent launch outcomes, newest first
  };
}

export function makeProject(product, type) {
  const cat = categoryById(product.category);
  const approach = approachById(product.approach);
  return {
    id: uid('prj'),
    typeId: type.id,
    name: type.name,
    approach: approach.id,
    work: Math.round(cat.mvpWork * type.workMul * (1 + product.completed.length * 0.09) * approach.work),
    done: 0
  };
}

export function newGame({ seed, meta, scenarioId = 'standard', companyName = 'Untitled Inc.' } = {}) {
  const m = normalizeMeta(meta || emptyMeta());
  const fx = metaEffects(m);
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) || SCENARIOS[0];
  const rng = makeRng(seed ?? (Date.now() & 0x7fffffff));

  const founder = makeEmployee(rng, 'founder', {
    name: 'You', skillBonus: fx.founderSkill || 0, specialty: null, morale: 0.9
  });
  founder.id = 'founder';
  founder.salary = 0;

  const employees = [founder];
  for (let i = 0; i < (fx.startEngineers || 0); i++) {
    employees.push(makeEmployee(rng, 'senior_engineer', { hiredDay: 0 }));
  }

  const startTier = fx.startTier || 'garage';
  const departments = {};
  for (const d of DEPARTMENTS) departments[d.id] = { id: d.id, priority: 'balanced', managerId: null };

  const product = makeProduct(rng, 'mobile');
  product.projects.push(makeProject(product, { id: 'mvp', name: 'Build MVP', workMul: 1.0 }));

  const state = {
    version: SAVE_VERSION,
    seed: rng.s,
    rng,
    scenarioId: scenario.id,
    time: { day: 0, paused: false, lastRealMs: Date.now(), startedRealMs: Date.now() },
    company: {
      name: companyName,
      stage: 'solo',
      reputation: 1 + (fx.startReputation || 0),
      cash: 15000 + (fx.startCash || 0),
      founderEquity: 1,
      ownership: { soldTotal: 0, transactions: [] },
      totalRaised: 0,
      marketingBudget: 0,
      pace: 'normal',
      lifetimeRevenue: 0,
      lifetimeExpenses: 0
    },
    office: { tier: startTier, rooms: [], deskCapacity: OFFICE_TIERS.find((t) => t.id === startTier).desks },
    products: [product],
    employees,
    candidates: [],
    candidateTimer: 0,
    departments,
    infra: { capacity: 12, load: 0, reliability: 0.9, autoscale: false, spendDay: 0, outageTimer: 0 },
    research: { completed: (fx.startResearch || []).slice(), active: [], points: 0 },
    funding: { rounds: [], offers: [], exitOffers: [], targets: [], perks: [], exitMods: {}, loans: [] },
    contracts: [],
    competitors: COMPETITORS.map((c) => makeRival(c, scenario.mods || {})),
    rivalState: { nemesis: null, wars: [], passed: [] },
    events: { pending: [], cooldown: 1.5, log: [], seen: {}, lastEventId: null, recentCats: [], scheduled: [], lastTriggered: {} },
    advisors: emptyAdvisors(),
    goals: emptyGoals(),
    acquisitions: emptyAcquisitions(),
    exitResult: null,
    alumni: [],
    market: emptyMarket(),
    boosts: [],
    stats: {
      revenueDay: 0, expenseDay: 0, payrollDay: 0, infraDay: 0, marketingDay: 0, rentDay: 0,
      netDay: 0, valuation: 0, users: 0, customers: 0, supportCoverage: 1, history: []
    },
    flags: { unlocked: [] },
    notifications: [],
    pendingEventSubject: null,
    meta: m
  };
  refreshCandidates(state, 3);
  return state;
}

export function availableRoles(state) {
  return ROLES.filter((r) => r.id !== 'founder' && stageOrder(r.unlock) <= stageOrder(state.company.stage));
}

export function refreshCandidates(state, n) {
  const pool = availableRoles(state);
  const roles = pool.length ? pool : [roleById('engineer')];
  const fx = metaEffects(state.meta);
  for (let i = 0; i < n; i++) {
    const role = pick(state.rng, roles);
    const c = makeCandidate(state.rng, role.id, {
      skillBonus: (fx.candidateSkill || 0) + (state.modCache?.hireQuality || 0) * 2,
      hiredDay: state.time.day,
      stage: stageOrder(state.company.stage),
      legendaryBonus: (fx.legendaryTalent || 0) + (state.modCache?.legendaryTalent || 0)
    });
    c.expiresDay = state.time.day + range(state.rng, 6, 14);
    state.candidates.push(c);
  }
}

export { CUSTOMER_CLASSES };
