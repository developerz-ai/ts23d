// Visual hull from drawings: the solid whose front, side (and optionally top) views match SVG
// silhouettes, as a signed-distance field. Each view's exact 2D polygon distance (even-odd fill),
// extruded along its view axis, intersected with the others and with the drawings' bounding box:
// max of exact distances, so the field is 1-Lipschitz, exact inside and a lower bound outside —
// safe for sparse meshing and for `sculpt` edits that smooth-blend and refine it.
//   front: drawing in YZ (paper right = +Y), side: XZ (paper right = +X = front), top: XY
// Front and side are anchored at the paper's bottom centre (z = 0 = paper bottom), top at its
// centre; all views share one `scale`/`size` so they agree in metres.

import type { Vec2, Vec3 } from '../core/index.ts';
import { invalid } from './check.ts';
import { type SvgOptions, svgShape } from './svg-doc.ts';

/** Exact signed distance to a set of closed contours (even-odd inside), negative inside. */
export function polygonSdf(
  contours: readonly (readonly Vec2[])[],
): (x: number, y: number) => number {
  const e: number[] = [];
  for (const c of contours)
    for (let i = 0; i < c.length; i++) {
      const a = c[i] ?? [0, 0];
      const b = c[(i + 1) % c.length] ?? a;
      e.push(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    }
  const E = Float64Array.from(e);
  const n = E.length;
  return (x, y) => {
    let best = Number.POSITIVE_INFINITY;
    let inside = false;
    for (let i = 0; i < n; i += 4) {
      const ax = E[i] ?? 0;
      const ay = E[i + 1] ?? 0;
      const dx = E[i + 2] ?? 0;
      const dy = E[i + 3] ?? 0;
      const px = x - ax;
      const py = y - ay;
      const dd = dx * dx + dy * dy;
      let t = dd > 0 ? (px * dx + py * dy) / dd : 0;
      t = t < 0 ? 0 : Math.min(t, 1);
      const qx = px - dx * t;
      const qy = py - dy * t;
      const d2 = qx * qx + qy * qy;
      if (d2 < best) best = d2;
      // Crossing test of a +X ray (half-open in y so shared vertices count once).
      const by = ay + dy;
      if (ay > y !== by > y && x < ax + (dx * (y - ay)) / dy) inside = !inside;
    }
    const d = Math.sqrt(best);
    return inside ? -d : d;
  };
}

/**
 * Exact memo of a 2D field by its (u, v) arguments. The mesher samples a lattice, so each view's
 * (u, v) pair recurs once per grid step along the view axis (and in the gradient taps): the
 * O(edges) polygon distance runs once per pair instead. Same doubles in, same double out.
 */
export function memo2(f: (u: number, v: number) => number): (u: number, v: number) => number {
  const rows = new Map<number, Map<number, number>>();
  return (u, v) => {
    let row = rows.get(u);
    if (!row) {
      row = new Map();
      rows.set(u, row);
    }
    const hit = row.get(v);
    if (hit !== undefined) return hit;
    const d = f(u, v);
    row.set(v, d);
    return d;
  };
}

export interface SilhouetteOptions extends Omit<SvgOptions, 'origin'> {
  /** Looking at the front (from +X): paper right = +Y, up = +Z. */
  readonly front?: string;
  /** Looking at the side (from −Y): paper right = +X, up = +Z. */
  readonly side?: string;
  /** Looking down: paper right = +X, paper up = +Y. */
  readonly top?: string;
  /** World offset of the hull. */
  readonly at?: Vec3;
  /** Round the creases where two views cut each other: smooth intersection radius, metres. */
  readonly round?: number;
}

/** A field and the box it lives in: spread it into a `sculpt` edit ({ ...visualHull(o), blend }). */
export interface FieldSolid {
  readonly field: (p: Vec3) => number;
  readonly bounds: readonly [Vec3, Vec3];
}

export function visualHull(o: SilhouetteOptions): FieldSolid {
  const views = [o.front, o.side, o.top].filter((v) => v !== undefined).length;
  if (views < 2)
    invalid(`silhouette has ${views} view`, 'give at least two of front, side, top (SVG strings)');
  const lo: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const hi: [number, number, number] = [Infinity, Infinity, Infinity];
  const clip = (axis: number, a: number, b: number): void => {
    lo[axis] = Math.max(lo[axis] ?? 0, a);
    hi[axis] = Math.min(hi[axis] ?? 0, b);
  };
  const fs: ((x: number, y: number, z: number) => number)[] = [];
  const view = (svg: string | undefined, ax: number, ay: number, centre: boolean): void => {
    if (svg === undefined) return;
    const s = svgShape(svg, { ...o, origin: centre ? 'centre' : 'bottom' });
    const f = memo2(polygonSdf(s.contours.map((c) => c.points)));
    clip(ax, s.min[0], s.max[0]);
    clip(ay, s.min[1], s.max[1]);
    fs.push(
      ax === 1 ? (_x, y, z) => f(y, z) : ay === 2 ? (x, _y, z) => f(x, z) : (x, y) => f(x, y),
    );
  };
  view(o.front, 1, 2, false);
  view(o.side, 0, 2, false);
  view(o.top, 0, 1, true);
  if (!lo.every((v, i) => v < (hi[i] ?? 0)))
    invalid(
      'silhouette views do not overlap',
      'draw every view at the same scale, standing on the paper bottom',
    );
  const [ox, oy, oz] = o.at ?? [0, 0, 0];
  const k = o.round ?? 0;
  if (!(k >= 0)) invalid(`silhouette round is ${o.round}`, 'use a radius ≥ 0 m (0.01 = 1 cm)');
  const c = lo.map((v, i) => (v + (hi[i] ?? 0)) / 2);
  const h = lo.map((v, i) => ((hi[i] ?? 0) - v) / 2);
  const [cx = 0, cy = 0, cz = 0] = c;
  const [hx = 0, hy = 0, hz = 0] = h;
  const field = (p: Vec3): number => {
    const x = p[0] - ox;
    const y = p[1] - oy;
    const z = p[2] - oz;
    // Box first: exact distance to the bounds, so the max stays a valid bound everywhere.
    const qx = Math.abs(x - cx) - hx;
    const qy = Math.abs(y - cy) - hy;
    const qz = Math.abs(z - cz) - hz;
    const [mx, my, mz] = [Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)];
    const box = Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0);
    let d = Number.NEGATIVE_INFINITY;
    for (const f of fs) {
      const v = f(x, y, z);
      if (d === Number.NEGATIVE_INFINITY || k <= 0) d = Math.max(d, v);
      else {
        // Polynomial smooth max (1-Lipschitz, ≥ the hard max): rounds view-against-view creases.
        const w = Math.max(0, Math.min(1, 0.5 + (0.5 * (d - v)) / k));
        if (w < 1) d = w > 0 ? v + (d - v) * w + k * w * (1 - w) : v;
      }
    }
    return Math.max(box, d);
  };
  return {
    field,
    bounds: [
      [lo[0] + ox, lo[1] + oy, lo[2] + oz],
      [hi[0] + ox, hi[1] + oy, hi[2] + oz],
    ],
  };
}
