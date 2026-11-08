// Coordinate (compass) search: the simple, derivative-free fallback. Try ±h along each axis in
// order, keep any improvement, halve h after a sweep without one. No randomness at all.

import {
  clamp01,
  type MinimiseOptions,
  type Minimum,
  type Objective,
  type Step,
  Tracker,
} from './minimise.ts';

export function coordinateSearch(f: Objective, o: MinimiseOptions): Minimum {
  const n = o.x0.length;
  const tolX = o.tolX ?? 1e-4;
  const t = new Tracker(f, o.x0);
  let x = clamp01(o.x0);
  let fx = t.eval(x);
  let h = o.sigma ?? 0.25;
  const history: Step[] = [{ gen: 0, evals: 1, best: fx, current: fx, sigma: h }];
  let stop: Minimum['stop'] = 'evals';
  for (let gen = 1; ; gen++) {
    if (o.target !== undefined && t.best <= o.target) {
      stop = 'target';
      break;
    }
    if (h < tolX) {
      stop = 'tolx';
      break;
    }
    let improved = false;
    for (let i = 0; i < n && t.evals < o.evals; i++)
      for (const dir of [1, -1]) {
        if (t.evals >= o.evals) break;
        const y = clamp01(x.map((v, k) => (k === i ? v + dir * h : v)));
        if (y[i] === x[i]) continue;
        const fy = t.eval(y);
        if (fy < fx) {
          [x, fx, improved] = [y, fy, true];
          break;
        }
      }
    history.push({ gen, evals: t.evals, best: t.best, current: fx, sigma: h });
    if (t.evals >= o.evals) break;
    if (!improved) h /= 2;
  }
  return { x: t.bestX, f: t.best, evals: t.evals, history, stop };
}
