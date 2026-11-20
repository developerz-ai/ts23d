// Signed-distance building blocks for `sdf`: exact shape distances (Quílez's formulas), boolean
// and smooth combinators with a quadratic (C1, the default) or cubic (C2) blend kernel (noise for
// `displace`: value-noise.ts). Negative = inside, metres.
// A field is called once per grid sample, so shapes do scalar maths only (no Vec3 allocation);
// fields must not keep the `p` they are given (the mesher reuses it).

import type { Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import { type SilhouetteOptions, visualHull } from './sdf-silhouette.ts';

export type Field = (p: Vec3) => number;

/**
 * Smooth-min kernel over a blend width k (|a − b| < k blends). 'quad': C1, undershoot k/4 (the
 * default; every committed asset uses it). 'cubic': C2 (no curvature jump at the blend's edge, so
 * joins read as one form under raking light), undershoot k/6. Both are 1-Lipschitz.
 */
export type BlendKernel = 'quad' | 'cubic';

const clamp01 = (x: number): number => (x < 0 ? 0 : Math.min(x, 1));

/** Shape distances in the shape's own frame (centre/base at the origin). */
export const shapes = {
  sphere: (x: number, y: number, z: number, r: number): number =>
    Math.sqrt(x * x + y * y + z * z) - r,
  ellipsoid(x: number, y: number, z: number, rx: number, ry: number, rz: number): number {
    const k0 = Math.sqrt(dmath.pow(x / rx, 2) + dmath.pow(y / ry, 2) + dmath.pow(z / rz, 2));
    const k1 = Math.sqrt(
      dmath.pow(x / (rx * rx), 2) + dmath.pow(y / (ry * ry), 2) + dmath.pow(z / (rz * rz), 2),
    );
    return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
  },
  /** Box of half extents (hx, hy, hz) with edges rounded by `r`. */
  roundBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, r: number): number {
    const qx = Math.abs(x) - hx + r;
    const qy = Math.abs(y) - hy + r;
    const qz = Math.abs(z) - hz + r;
    const ox = Math.max(qx, 0);
    const oy = Math.max(qy, 0);
    const oz = Math.max(qz, 0);
    return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
  },
  /** Segment (0,0,0) → (0,0,len) with radius r. */
  capsule(x: number, y: number, z: number, len: number, r: number): number {
    const t = len > 0 ? Math.min(Math.max(z, 0), len) : 0;
    return Math.sqrt(x * x + y * y + (z - t) * (z - t)) - r;
  },
  /** Capped cone standing on z = 0: base radius r1, top radius r2, height h. */
  cone(x: number, y: number, z: number, r1: number, r2: number, h: number): number {
    const hh = h / 2;
    const qx = Math.sqrt(x * x + y * y);
    const qy = z - hh;
    const cax = qx - Math.min(qx, qy < 0 ? r1 : r2);
    const cay = Math.abs(qy) - hh;
    const k2x = r2 - r1;
    const k2y = 2 * hh;
    const t = clamp01(((r2 - qx) * k2x + (hh - qy) * k2y) / (k2x * k2x + k2y * k2y));
    const cbx = qx - r2 + k2x * t;
    const cby = qy - hh + k2y * t;
    const s = cbx < 0 && cay < 0 ? -1 : 1;
    return s * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby));
  },
  /** Spheres r1 at (0,0,0) and r2 at (0,0,h) joined by their tangent cone; exact (Quílez). */
  roundCone(x: number, y: number, z: number, r1: number, r2: number, h: number): number {
    const qx = Math.sqrt(x * x + y * y);
    const b = h > 0 ? (r1 - r2) / h : 2;
    // One sphere swallows the other: the bigger sphere is the shape.
    if (b * b >= 1) {
      const top = r2 > r1;
      return Math.sqrt(qx * qx + dmath.pow(top ? z - h : z, 2)) - (top ? r2 : r1);
    }
    const a = Math.sqrt(1 - b * b);
    const k = -b * qx + a * z;
    if (k < 0) return Math.sqrt(qx * qx + z * z) - r1;
    if (k > a * h) return Math.sqrt(qx * qx + (z - h) * (z - h)) - r2;
    return a * qx + b * z - r1;
  },
  /**
   * Superellipsoid |x/a|ⁿ + |y/b|ⁿ + |z/c|ⁿ = 1 (n = 2 ellipsoid, n → ∞ box), as
   * min(a, b, c) · (‖(x/a, y/b, z/c)‖ₙ − 1): 1-Lipschitz for n ≥ 2, exact on the surface.
   */
  superellipsoid(x: number, y: number, z: number, a: number, b: number, c: number, n: number) {
    const g = dmath.pow(
      dmath.pow(Math.abs(x / a), n) + dmath.pow(Math.abs(y / b), n) + dmath.pow(Math.abs(z / c), n),
      1 / n,
    );
    return Math.min(a, b, c) * (g - 1);
  },
  /** Ring in the XY plane: major radius R, tube radius r. */
  torus(x: number, y: number, z: number, R: number, r: number): number {
    const q = Math.sqrt(x * x + y * y) - R;
    return Math.sqrt(q * q + z * z) - r;
  },
};

/**
 * Polynomial smooth-min weight: 1 → all `a`, 0 → all `b`; k = 0 is a hard min. For 'cubic' it is
 * ∂smin/∂a, so colour mixed by it follows the surface; exactly 1 once a ≤ b − k (both kernels).
 */
export function smoothWeight(
  a: number,
  b: number,
  k: number,
  kernel: BlendKernel = 'quad',
): number {
  if (kernel === 'quad' || !(k > 0))
    return k > 0 ? clamp01(0.5 + (0.5 * (b - a)) / k) : a < b ? 1 : 0;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return a < b ? 1 - 0.5 * h * h : 0.5 * h * h;
}

/** Cubic (C2) smooth min of width k: min(a, b) − k·h³/6, h = max(k − |a − b|, 0) / k. */
export function cubicMin(a: number, b: number, k: number): number {
  const m = Math.min(a, b);
  if (!(k > 0)) return m;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return m - (k * h * h * h) / 6;
}

/** Smooth min of a and b over width k with the given kernel (k = 0: plain min). */
export function smoothMin(a: number, b: number, k: number, kernel: BlendKernel = 'quad'): number {
  if (kernel === 'cubic') return cubicMin(a, b, k);
  const h = smoothWeight(a, b, k);
  return b + (a - b) * h - k * h * (1 - h);
}

/** Field constructors and combinators, world space. */
export const sd = {
  sphere:
    (at: Vec3, r: number): Field =>
    (p) =>
      shapes.sphere(p[0] - at[0], p[1] - at[1], p[2] - at[2], r),
  ellipsoid:
    (at: Vec3, radii: Vec3): Field =>
    (p) =>
      shapes.ellipsoid(p[0] - at[0], p[1] - at[1], p[2] - at[2], radii[0], radii[1], radii[2]),
  /** Axis-aligned box of full `size` centred on `at`, edges rounded by `round`. */
  box:
    (at: Vec3, size: Vec3, round = 0): Field =>
    (p) =>
      shapes.roundBox(
        p[0] - at[0],
        p[1] - at[1],
        p[2] - at[2],
        size[0] / 2,
        size[1] / 2,
        size[2] / 2,
        round,
      ),
  capsule(a: Vec3, b: Vec3, r: number): Field {
    const bx = b[0] - a[0];
    const by = b[1] - a[1];
    const bz = b[2] - a[2];
    const bb = bx * bx + by * by + bz * bz;
    return (p) => {
      const px = p[0] - a[0];
      const py = p[1] - a[1];
      const pz = p[2] - a[2];
      const h = bb > 0 ? clamp01((px * bx + py * by + pz * bz) / bb) : 0;
      return (
        Math.sqrt(
          dmath.pow(px - bx * h, 2) + dmath.pow(py - by * h, 2) + dmath.pow(pz - bz * h, 2),
        ) - r
      );
    };
  },
  cone:
    (at: Vec3, r1: number, r2: number, h: number): Field =>
    (p) =>
      shapes.cone(p[0] - at[0], p[1] - at[1], p[2] - at[2], r1, r2, h),
  torus:
    (at: Vec3, R: number, r: number): Field =>
    (p) =>
      shapes.torus(p[0] - at[0], p[1] - at[1], p[2] - at[2], R, r),
  union:
    (...fs: readonly Field[]): Field =>
    (p) => {
      let d = Number.POSITIVE_INFINITY;
      for (const f of fs) d = Math.min(d, f(p));
      return d;
    },
  intersect:
    (a: Field, b: Field): Field =>
    (p) =>
      Math.max(a(p), b(p)),
  /** a minus b. */
  subtract:
    (a: Field, b: Field): Field =>
    (p) =>
      Math.max(a(p), -b(p)),
  /** Union with a fillet of radius ~k metres between the two ('cubic': C2 fillet). */
  smoothUnion:
    (k: number, a: Field, b: Field, kernel: BlendKernel = 'quad'): Field =>
    (p) => {
      const da = a(p);
      const db = b(p);
      if (kernel === 'cubic') return cubicMin(da, db, k);
      const h = smoothWeight(da, db, k);
      return db + (da - db) * h - k * h * (1 - h);
    },
  /** a minus b with a rounded crease of ~k metres ('cubic': C2 crease). */
  smoothSubtract:
    (k: number, a: Field, b: Field, kernel: BlendKernel = 'quad'): Field =>
    (p) => {
      const da = a(p);
      const db = -b(p);
      if (kernel === 'cubic') return -cubicMin(-da, -db, k);
      const h = smoothWeight(-da, -db, k);
      return da + (db - da) * (1 - h) + k * h * (1 - h);
    },
  /** Visual hull of SVG front/side/top drawings (sdf-silhouette.ts); `visualHull()` adds bounds. */
  silhouette: (o: SilhouetteOptions): Field => visualHull(o).field,
  /** Push the surface out/in by `amount` metres × noise (∈ [−1, 1]). */
  displace:
    (f: Field, noise: Field, amount: number): Field =>
    (p) =>
      f(p) + amount * noise(p),
};
