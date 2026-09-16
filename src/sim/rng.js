// Seeded, serializable PRNG. One uint32 of state so saves can restore it exactly.
export function makeRng(seed = 1) {
  return { s: (seed >>> 0) || 1 };
}

export function rnd(rng) {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const range = (rng, a, b) => a + rnd(rng) * (b - a);
export const int = (rng, a, b) => Math.floor(range(rng, a, b + 1));
export const pick = (rng, arr) => arr[Math.floor(rnd(rng) * arr.length)];
export const chance = (rng, p) => rnd(rng) < p;

export function weighted(rng, items, weightOf) {
  let total = 0;
  for (const it of items) total += Math.max(0, weightOf(it));
  if (total <= 0) return null;
  let r = rnd(rng) * total;
  for (const it of items) {
    r -= Math.max(0, weightOf(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

// Probability p applies "per day"; convert to a probability for a partial-day step
// so batched offline ticks and fine live ticks agree.
export const perDay = (p, days) => 1 - Math.pow(1 - Math.min(0.999, p), days);
