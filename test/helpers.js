import { newGame, emptyMeta } from '../src/sim/state.js';
import { step } from '../src/sim/engine.js';
import { computeMods } from '../src/sim/modifiers.js';

export function game(seed = 1, opts = {}) {
  const s = newGame({ seed, ...opts });
  s.time.lastRealMs = 1_700_000_000_000;
  return s;
}
export const mods = (s) => computeMods(s);
export function run(s, days, chunk = 0.05) {
  for (let d = 0; d < days; d += chunk) step(s, Math.min(chunk, days - d), null);
  return s;
}
/** Force the first product live without waiting for engineering. */
export function launch(s, productIndex = 0) {
  const p = s.products[productIndex];
  if (p.projects.length) p.projects[0].done = p.projects[0].work;
  run(s, 0.1);
  return p;
}
