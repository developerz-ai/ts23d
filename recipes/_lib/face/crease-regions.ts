// Crease regions from geometry, for folds that are areas of small folds rather than one line: the
// auricle (helix, antihelix, concha), the mouth cavity behind the lips, a hair or beard mass's
// edge, the armpit at the arm cut. Selected warped-base vertices are binned on a grid of the
// region radius and each bin becomes one region at its centroid — always from what shapes the
// bust, never from what QA reported.

import type { IntendedCrease, Vec3 } from '@developerz.ai/ts23d';

/** One region per occupied `r`-sized cell of `pts` (centroid of the cell's points). */
export function regionsOf(
  name: string,
  part: string,
  pts: readonly Vec3[],
  r: number,
  why: string,
): IntendedCrease[] {
  const bins = new Map<string, { s: [number, number, number]; n: number }>();
  for (const p of pts) {
    const k = `${Math.floor(p[0] / r)},${Math.floor(p[1] / r)},${Math.floor(p[2] / r)}`;
    const b = bins.get(k) ?? { s: [0, 0, 0], n: 0 };
    b.s[0] += p[0];
    b.s[1] += p[1];
    b.s[2] += p[2];
    b.n++;
    bins.set(k, b);
  }
  return [...bins.keys()].sort().map((k, i) => {
    const b = bins.get(k) ?? { s: [0, 0, 0], n: 1 };
    return {
      name: `${name}_${i}`,
      part,
      at: [b.s[0] / b.n, b.s[1] / b.n, b.s[2] / b.n] as Vec3,
      radius: r,
      why,
    };
  });
}

/** The centroid of a set of lines, as one region (QA judges a seam chain by its centroid). */
export function centroidRegion(
  name: string,
  part: string,
  lines: readonly (readonly Vec3[])[],
  r: number,
  why: string,
): IntendedCrease[] {
  const all = lines.flat();
  if (all.length === 0) return [];
  const c: [number, number, number] = [0, 0, 0];
  for (const p of all) for (let k = 0; k < 3; k++) c[k] = (c[k] ?? 0) + (p[k] ?? 0) / all.length;
  return [{ name, part, at: c, radius: r, why }];
}
