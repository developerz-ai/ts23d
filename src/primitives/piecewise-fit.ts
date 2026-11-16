// Non-rigid registration of a model's mesh onto the code body, after the global similarity fit
// (similarity-fit.ts): a model's wolf turns its head, plants its legs elsewhere and carries its
// tail its own way, so one similarity leaves centimetres of misfit exactly where its detail is
// best. The fitted points are split into `clusters` regions (farthest-point seeds, then
// nearest-seed assignment: deterministic), each region gets its own trimmed-ICP similarity onto
// the target surface (scale held near 1), and every point moves by the Gaussian-weighted blend
// of the region transforms around it (an embedded-deformation-style warp: no cracks between
// regions). Code keeps the skeleton; the model's surface is bent onto it.

import type { Vec3 } from '../core/index.ts';
import { invalid } from './check.ts';
import {
  applySimilarity,
  fitToSurface,
  IDENTITY,
  type Projector,
  type Similarity,
} from './similarity-fit.ts';

export interface PiecewiseFit {
  /** Region centres (after the global fit) and their own similarity. */
  readonly regions: readonly { readonly centre: Vec3; readonly fit: Similarity }[];
  /** Blend radius, metres. */
  readonly sigma: number;
  /** A globally fitted point → its registered position. */
  readonly warp: (p: Vec3) => Vec3;
}

const d2 = (a: Vec3, b: Vec3): number =>
  (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

export function fitPiecewise(
  points: readonly Vec3[],
  project: Projector,
  o: { readonly clusters?: number; readonly iterations?: number; readonly trim?: number } = {},
): PiecewiseFit {
  const k = Math.min(o.clusters ?? 16, points.length);
  if (k < 1) invalid('fitPiecewise: no points', 'pass the globally fitted model points');
  // Farthest-point seeds from the first point.
  const seeds: Vec3[] = [points[0] ?? [0, 0, 0]];
  const near = points.map((p) => d2(p, seeds[0] ?? p));
  while (seeds.length < k) {
    let best = 0;
    for (let i = 1; i < points.length; i++) if ((near[i] ?? 0) > (near[best] ?? 0)) best = i;
    const s = points[best] ?? [0, 0, 0];
    seeds.push(s);
    points.forEach((p, i) => {
      near[i] = Math.min(near[i] ?? 0, d2(p, s));
    });
  }
  const groups: Vec3[][] = seeds.map(() => []);
  for (const p of points) {
    let g = 0;
    for (let j = 1; j < seeds.length; j++) if (d2(p, seeds[j] ?? p) < d2(p, seeds[g] ?? p)) g = j;
    groups[g]?.push(p);
  }
  const regions = groups.map((g, j) => {
    const centre = seeds[j] ?? [0, 0, 0];
    if (g.length < 8) return { centre, fit: IDENTITY };
    const { fit } = fitToSurface(g, project, [IDENTITY], {
      iterations: o.iterations ?? 8,
      trim: o.trim ?? 0.3,
    });
    // A region may bend and turn, not grow: hold the scale near 1.
    const s = Math.max(0.9, Math.min(1.1, fit.s));
    return { centre, fit: { ...fit, s } };
  });
  // Blend radius: the mean seed spacing.
  let spacing = 0;
  for (const s of seeds) {
    let m = Infinity;
    for (const t of seeds) if (t !== s) m = Math.min(m, d2(s, t));
    spacing += Number.isFinite(m) ? Math.sqrt(m) : 0;
  }
  const sigma = Math.max(1e-3, spacing / seeds.length);
  const warp = (p: Vec3): Vec3 => {
    let w = 0;
    const out: [number, number, number] = [0, 0, 0];
    for (const r of regions) {
      const wi = Math.exp(-d2(p, r.centre) / (2 * sigma * sigma));
      if (wi < 1e-6) continue;
      const q = applySimilarity(r.fit, p);
      out[0] += wi * q[0];
      out[1] += wi * q[1];
      out[2] += wi * q[2];
      w += wi;
    }
    return w > 0 ? [out[0] / w, out[1] / w, out[2] / w] : p;
  };
  return { regions, sigma, warp };
}
