export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sum = (arr, f = (x) => x) => arr.reduce((a, b) => a + f(b), 0);

let idCounter = 1;
export function uid(prefix = 'id') {
  return `${prefix}_${(idCounter++).toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}
// Saves carry the counter so ids stay unique across reloads.
export const getIdCounter = () => idCounter;
export const setIdCounter = (n) => { if (Number.isFinite(n) && n > idCounter) idCounter = n; };

const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc'];
export function abbrev(n, digits = 1) {
  if (!Number.isFinite(n)) return '0';
  const neg = n < 0;
  n = Math.abs(n);
  let u = 0;
  while (n >= 1000 && u < UNITS.length - 1) { n /= 1000; u++; }
  const s = u === 0 ? Math.round(n).toString() : n.toFixed(n < 10 ? digits : n < 100 ? 1 : 0);
  return (neg ? '-' : '') + s + UNITS[u];
}
export const money = (n, digits = 1) => (n < 0 ? '-$' : '$') + abbrev(Math.abs(n), digits);
export const pct = (n, d = 0) => `${(n * 100).toFixed(d)}%`;

export function fmtDuration(days) {
  if (days < 1 / 24) return `${Math.max(1, Math.round(days * 24 * 60))}m`;
  if (days < 1) return `${(days * 24).toFixed(1)}h`;
  if (days < 60) return `${days.toFixed(days < 10 ? 1 : 0)}d`;
  if (days < 730) return `${(days / 30.44).toFixed(1)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

export const byId = (arr, id) => arr.find((x) => x.id === id) || null;
