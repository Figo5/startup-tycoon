import { BACKGROUNDS, CHALLENGES, ACHIEVEMENTS, START_UNLOCKS, CHALLENGE_UNLOCK_EXITS, backgroundById, challengeById, achievementById } from '../data/legacy.js';
import { activeSynergies } from './org.js';
import { roleById } from '../data/roles.js';

const exitsOf = (meta) => (Array.isArray(meta?.runs) ? meta.runs.length : 0);
const has = (meta, id) => Array.isArray(meta?.achievements) && meta.achievements.includes(id);

export function backgroundUnlocked(meta, b) {
  if (!b.unlock) return true;
  if (b.unlock.exits && exitsOf(meta) >= b.unlock.exits) return true;
  if (b.unlock.achievement && has(meta, b.unlock.achievement)) return true;
  return false;
}

export function backgroundOptions(meta) {
  return BACKGROUNDS.map((b) => ({
    ...b, unlocked: backgroundUnlocked(meta, b),
    hint: b.unlock?.exits ? `Finish ${b.unlock.exits} compan${b.unlock.exits === 1 ? 'y' : 'ies'}`
      : b.unlock?.achievement ? `Achievement: ${achievementById(b.unlock.achievement)?.name || b.unlock.achievement}` : null
  }));
}

export const challengesUnlocked = (meta) => exitsOf(meta) >= CHALLENGE_UNLOCK_EXITS;

export function startCategoriesFor(meta) {
  const n = exitsOf(meta);
  return START_UNLOCKS.filter((u) => n >= u.exits).flatMap((u) => u.cats);
}

export const hasChallenge = (state, id) => Array.isArray(state?.challenges) && state.challenges.includes(id);

/** Modifier bag for the founder's background. Merged by computeMods. */
export function legacyMods(state) {
  return { ...(backgroundById(state.background || 'generalist').mods || {}) };
}

/** Founder Reputation multiplier for the run's challenges, as a delta. */
export function challengeFrBonus(state) {
  let v = 0;
  for (const id of state.challenges || []) {
    const c = challengeById(id);
    if (!c) continue;
    if (id === 'speedrun' && state.time.day >= 220) continue;
    v += c.frMul;
  }
  return v;
}

function award(state, a, log) {
  const meta = state.meta;
  if (!meta || has(meta, a.id)) return false;
  if (!Array.isArray(meta.achievements)) meta.achievements = [];
  meta.achievements.push(a.id);
  meta.founderRep = Math.max(0, (meta.founderRep || 0) + a.fr);
  meta.lifetimeRep = Math.max(0, (meta.lifetimeRep || 0) + a.fr);
  log?.(`Achievement: ${a.name}${a.fr ? ` (+${a.fr} Founder Reputation)` : ''}`, 'goal');
  return true;
}

/** Checks in-play achievements. Idempotent: each one pays exactly once, ever. */
export function tickAchievements(state, log) {
  if (!state.meta || state.exitResult) return;
  if (!state.flags) state.flags = { unlocked: [] };
  if (!state.flags.allSynergies && activeSynergies(state).every((s) => s.active)) state.flags.allSynergies = true;
  for (const a of ACHIEVEMENTS) {
    if (!a.check || has(state.meta, a.id)) continue;
    let ok = false;
    try { ok = !!a.check(state); } catch { ok = false; }
    if (ok) award(state, a, log);
  }
}

/** Exit-time achievements. Returns the ids newly earned. */
export function exitAchievements(state, exit) {
  const out = [];
  for (const a of ACHIEVEMENTS) {
    if (!a.atExit || has(state.meta, a.id)) continue;
    let ok = false;
    try { ok = !!a.atExit(state, exit); } catch { ok = false; }
    if (ok && award(state, a, null)) out.push(a.id);
  }
  return out;
}

export function ensureLegacyMeta(meta) {
  if (!meta.records || typeof meta.records !== 'object') meta.records = {};
  if (!Array.isArray(meta.hallOfFame)) meta.hallOfFame = [];
  meta.hallOfFame = meta.hallOfFame.filter((h) => h && typeof h.name === 'string' && roleById(h.role)).slice(0, 12);
  return meta;
}

/** Records and the hall of fame are updated once, when a company is sold. */
export function recordLegacy(state, meta, summary) {
  ensureLegacyMeta(meta);
  const r = meta.records;
  const best = (k, v, cmp = (a, b) => a > b) => { if (Number.isFinite(v) && (r[k] === undefined || cmp(v, r[k]))) r[k] = v; };
  best('bestValuation', summary.value);
  best('bestProceeds', summary.proceeds);
  best('fastestExit', Math.round(state.time.day), (a, b) => a < b);
  best('mostPeople', state.employees.length);
  best('bestRevenueDay', state.stats.revenueDay || 0);
  r.exits = (r.exits || 0) + 1;
  // The people who made this company, remembered by the next one.
  const stars = state.employees.filter((e) => e.id !== 'founder')
    .sort((a, b) => (b.skill + (b.shipped || 0) * 0.3 + (b.traits || []).length) - (a.skill + (a.shipped || 0) * 0.3 + (a.traits || []).length))
    .slice(0, 3)
    .map((e) => ({ name: e.name, role: e.role, skill: e.skill, traits: (e.traits || []).slice(0, 2), company: state.company.name,
      story: (e.story || []).slice(-2).map((x) => x.text) }));
  meta.hallOfFame = [...stars, ...meta.hallOfFame.filter((h) => !stars.some((s) => s.name === h.name))].slice(0, 12);
  return meta;
}

export { CHALLENGES, BACKGROUNDS, backgroundById, challengeById };
