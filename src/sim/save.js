import { SAVE_VERSION, emptyMeta, newGame, normalizeMeta, emptyRoadmap } from './state.js';
import { getIdCounter, setIdCounter, resetIdCounter } from './util.js';
import { normalizeEquity } from './equity.js';
import { ensureAdvisors } from './advisors.js';
import { ensureGoals } from './goals.js';
import { ensureAcquisitions } from './acquisitions.js';
import { COMPETITORS } from '../data/competitors.js';

export const SAVE_KEY = 'startup-tycoon/save/v1';
export const CORRUPT_KEY = 'startup-tycoon/corrupt';
export const TAB_KEY = 'startup-tycoon/tab';

const STRIP = ['modCache', 'workforceCache', 'pendingEventSubject'];

export function serialize(state) {
  const clone = {};
  for (const [k, v] of Object.entries(state)) {
    if (STRIP.includes(k) || k === 'meta') continue;
    clone[k] = v;
  }
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    idCounter: getIdCounter(),
    meta: state.meta || emptyMeta(),
    state: clone
  };
}

/** Structural validation. Returns { ok, reason }. Never mutates the input. */
export function validate(blob) {
  if (!blob || typeof blob !== 'object') return { ok: false, reason: 'Not an object' };
  if (typeof blob.version !== 'number') return { ok: false, reason: 'Missing version' };
  if (blob.version > SAVE_VERSION) return { ok: false, reason: `Save is from a newer build (v${blob.version})` };
  const s = blob.state;
  if (!s || typeof s !== 'object') return { ok: false, reason: 'Missing state' };
  const required = ['company', 'products', 'employees', 'time', 'stats', 'infra', 'research'];
  for (const k of required) if (!s[k]) return { ok: false, reason: `Missing ${k}` };
  if (!Array.isArray(s.products) || !Array.isArray(s.employees)) return { ok: false, reason: 'Bad collections' };
  if (typeof s.company.cash !== 'number' || !Number.isFinite(s.company.cash)) return { ok: false, reason: 'Bad cash value' };
  if (typeof s.time.day !== 'number' || s.time.day < 0) return { ok: false, reason: 'Bad clock' };
  if (!s.rng || typeof s.rng.s !== 'number') return { ok: false, reason: 'Missing RNG state' };
  return { ok: true };
}

const MIGRATIONS = {
  1: (blob) => {
    blob.state.contracts = blob.state.contracts || [];
    blob.state.boosts = blob.state.boosts || [];
    blob.version = 2;
    return blob;
  },
  2: (blob) => {
    blob.state.flags = blob.state.flags || { unlocked: [] };
    blob.state.funding = blob.state.funding || { rounds: [], offers: [], exitOffers: [] };
    blob.state.stats.history = blob.state.stats.history || [];
    blob.version = 3;
    return blob;
  },
  // v3 -> v4: the transactional and feature pass. Every step is additive and
  // idempotent, and nothing is retroactively awarded: an existing save gets the
  // new state containers empty, not filled in.
  3: (blob) => {
    const s = blob.state;
    applyRunDefaults(s);
    blob.meta = normalizeMeta(blob.meta || emptyMeta());
    blob.version = 4;
    return blob;
  }
};

/**
 * Fills in anything a run state should have, without ever granting progress.
 * Safe to run on every load: it only creates empty containers and repairs
 * out-of-range numbers.
 */
export function applyRunDefaults(s) {
  s.company = s.company || {};
  s.company.founderEquity = normalizeEquity(s.company.founderEquity);
  if (!s.company.ownership || typeof s.company.ownership !== 'object') {
    s.company.ownership = { soldTotal: 1 - s.company.founderEquity, transactions: [] };
  }
  if (!Array.isArray(s.company.ownership.transactions)) s.company.ownership.transactions = [];
  s.events = s.events || { pending: [], cooldown: 2, log: [], seen: {} };
  if (!s.events.lastEventId) s.events.lastEventId = null;
  if (!Array.isArray(s.events.recentCats)) s.events.recentCats = [];
  if (s.exitResult === undefined) s.exitResult = null;
  s.advisors = ensureAdvisors(s);
  s.goals = ensureGoals(s);
  s.acquisitions = ensureAcquisitions(s);
  for (const p of s.products || []) {
    if (!p.roadmap || typeof p.roadmap !== 'object') p.roadmap = emptyRoadmap();
    if (!Array.isArray(p.roadmap.history)) p.roadmap.history = [];
    for (const k of ['acqMul', 'revMul', 'churnMul', 'convMul']) {
      if (!Number.isFinite(p[k])) p[k] = 0;
    }
  }
  // Rivals saved before blurbs were stored keep their description.
  for (const c of s.competitors || []) {
    if (!c.blurb) c.blurb = COMPETITORS.find((x) => x.id === c.id)?.blurb || '';
  }
  // A settled run stays settled across a reload.
  if (s.exitResult) s.time.paused = true;
  return s;
}

export function migrate(blob) {
  let guard = 0;
  while (blob.version < SAVE_VERSION && guard++ < 20) {
    const fn = MIGRATIONS[blob.version];
    if (!fn) { blob.version = SAVE_VERSION; break; }
    blob = fn(blob);
  }
  return blob;
}

export function hydrate(blob) {
  const v = validate(blob);
  if (!v.ok) return { ok: false, reason: v.reason };
  const migrated = migrate(structuredClone(blob));
  const state = migrated.state;
  state.meta = normalizeMeta(migrated.meta || emptyMeta());
  state.version = SAVE_VERSION;
  setIdCounter(migrated.idCounter || 1);
  // Defensive defaults for anything a future field might rely on.
  state.notifications = state.notifications || [];
  state.boosts = state.boosts || [];
  state.contracts = state.contracts || [];
  state.candidates = state.candidates || [];
  state.stats.history = state.stats.history || [];
  applyRunDefaults(state);
  return { ok: true, state, savedAt: migrated.savedAt };
}

// --- storage ---
const store = () => (typeof localStorage !== 'undefined' ? localStorage : null);

export function save(state) {
  const ls = store();
  if (!ls) return false;
  try {
    ls.setItem(SAVE_KEY, JSON.stringify(serialize(state)));
    return true;
  } catch (err) {
    console.warn('Save failed', err);
    return false;
  }
}

export function load() {
  const ls = store();
  if (!ls) return { ok: false, reason: 'No storage' };
  const raw = ls.getItem(SAVE_KEY);
  if (!raw) return { ok: false, reason: 'No save' };
  let blob;
  try { blob = JSON.parse(raw); } catch {
    ls.setItem(CORRUPT_KEY, raw);
    return { ok: false, reason: 'Save file was unreadable. A copy was kept under the recovery key.', corrupt: true };
  }
  const r = hydrate(blob);
  if (!r.ok) {
    ls.setItem(CORRUPT_KEY, raw);
    return { ok: false, reason: `${r.reason}. The old save was kept under the recovery key.`, corrupt: true };
  }
  return r;
}

export function loadMeta() {
  const r = load();
  return r.ok ? (r.state.meta || emptyMeta()) : emptyMeta();
}

export function resetGame(keepMeta = true) {
  const meta = keepMeta ? loadMeta() : emptyMeta();
  const ls = store();
  if (ls) ls.removeItem(SAVE_KEY);
  return newGame({ meta });
}

// --- full reset ------------------------------------------------------------
// Everything under the progress prefix can carry game progress and is removed by
// a reset. UI preferences live under their own prefix and are never touched, so
// a reset cannot take a player's motion/volume/theme settings with it.
export const PROGRESS_PREFIX = 'startup-tycoon/';
export const PREF_PREFIX = 'startup-tycoon/prefs/';

/** Every stored key that could be holding progress. */
export function progressKeys(ls = store()) {
  if (!ls) return [];
  const keys = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k && k.startsWith(PROGRESS_PREFIX) && !k.startsWith(PREF_PREFIX)) keys.push(k);
  }
  return keys;
}

/**
 * Removes every progress-bearing key - the live save, the corrupt-save recovery
 * copy, the single-tab claim, and anything an older or future build stored under
 * the same prefix, so no legacy key can recreate meta progression. Returns the
 * keys removed, so a caller can report exactly what went.
 */
export function clearProgressKeys(ls = store()) {
  if (!ls) return [];
  const removed = progressKeys(ls);
  for (const k of removed) { try { ls.removeItem(k); } catch { /* keep going */ } }
  return removed;
}

/**
 * The one authoritative full reset: wipes every progress key, then hands back a
 * completely new state built by the same constructor a first-ever load uses.
 * The clean state is persisted once, with a fresh clock, so a reload shows it and
 * offline catch-up has nothing to replay. Safe to call repeatedly.
 */
export function resetAllProgress({ companyName, seed } = {}) {
  const removed = clearProgressKeys();
  resetIdCounter();
  const state = newGame({ companyName, seed });
  state.time.lastRealMs = Date.now();
  state.time.startedRealMs = state.time.lastRealMs;
  save(state);
  return { state, removed };
}

export function exportSave(state) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(serialize(state)))));
}

export function importSave(text) {
  let blob;
  try {
    const json = text.trim().startsWith('{') ? text : decodeURIComponent(escape(atob(text.trim())));
    blob = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'That does not look like a Startup Tycoon save.' };
  }
  return hydrate(blob);   // caller replaces state only if ok
}

// --- single-tab guard ---
export function claimTab(id) {
  const ls = store();
  if (!ls) return { owner: true };
  const now = Date.now();
  let cur = null;
  try { cur = JSON.parse(ls.getItem(TAB_KEY) || 'null'); } catch { cur = null; }
  if (cur && cur.id !== id && now - cur.at < 6000) return { owner: false, other: cur.id };
  ls.setItem(TAB_KEY, JSON.stringify({ id, at: now }));
  return { owner: true };
}
