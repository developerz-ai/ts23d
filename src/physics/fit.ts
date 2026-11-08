// Enclosing implicit shapes fitted to a point set: box (axis-aligned or PCA-oriented, the
// smaller), sphere, capsule and cylinder (along each box axis, the smallest). Every shape
// contains every point; `volume` lets the caller compare fit quality. Capsules and cylinders are
// Y-aligned in their own frame, as KHR_implicit_shapes defines them.

import type { Quat, Vec3 } from '../core/index.ts';
import { eigenSym, frameWithY, quatFromAxes } from './linalg.ts';

/** Thinnest box side written (KHR_implicit_shapes requires sizes > 0). */
export const MIN_SIZE = 0.01;

export interface BoxFit {
  readonly kind: 'box';
  readonly center: Vec3;
  readonly rotation: Quat;
  readonly size: Vec3;
  readonly volume: number;
  /** The box's frame (columns of `rotation`), reused for round fits. */
  readonly axes: readonly [Vec3, Vec3, Vec3];
}
export interface SphereFit {
  readonly kind: 'sphere';
  readonly center: Vec3;
  readonly radius: number;
  readonly volume: number;
}
export interface RoundFit {
  readonly kind: 'capsule' | 'cylinder';
  readonly center: Vec3;
  /** Rotates local +Y onto the shape's axis. */
  readonly rotation: Quat;
  /** Cylinder: full height. Capsule: distance between the cap centres (KHR definition). */
  readonly height: number;
  readonly radius: number;
  readonly volume: number;
}

const AX = [0, 1, 2] as const;
const v3 = (f: (k: 0 | 1 | 2) => number): Vec3 => [f(0), f(1), f(2)];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const along = (axes: readonly [Vec3, Vec3, Vec3], c: Vec3): Vec3 => [
  axes[0][0] * c[0] + axes[1][0] * c[1] + axes[2][0] * c[2],
  axes[0][1] * c[0] + axes[1][1] * c[1] + axes[2][1] * c[2],
  axes[0][2] * c[0] + axes[1][2] * c[1] + axes[2][2] * c[2],
];
const IDENTITY: readonly [Vec3, Vec3, Vec3] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

function boxIn(points: readonly Vec3[], axes: readonly [Vec3, Vec3, Vec3]): BoxFit {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of points)
    axes.forEach((a, k) => {
      const d = dot(p, a);
      if (d < (lo[k] ?? 0)) lo[k] = d;
      if (d > (hi[k] ?? 0)) hi[k] = d;
    });
  const size = v3((k) => Math.max(MIN_SIZE, (hi[k] ?? 0) - (lo[k] ?? 0)));
  const mid = v3((k) => ((hi[k] ?? 0) + (lo[k] ?? 0)) / 2);
  return {
    kind: 'box',
    center: along(axes, mid),
    rotation: quatFromAxes(...axes),
    size,
    volume: size[0] * size[1] * size[2],
    axes,
  };
}

/** The smaller of the axis-aligned box and the principal-axes (PCA) box. */
export function fitBox(points: readonly Vec3[]): BoxFit {
  const aabb = boxIn(points, IDENTITY);
  const n = points.length || 1;
  const m = [0, 0, 0];
  for (const p of points) for (const k of AX) m[k] = (m[k] ?? 0) + p[k] / n;
  const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of points)
    for (const i of AX)
      for (const j of AX)
        cov[i * 3 + j] = (cov[i * 3 + j] ?? 0) + ((p[i] - (m[i] ?? 0)) * (p[j] - (m[j] ?? 0))) / n;
  const c = (i: number): Vec3 => [cov[i * 3] ?? 0, cov[i * 3 + 1] ?? 0, cov[i * 3 + 2] ?? 0];
  const pca = boxIn(points, eigenSym([c(0), c(1), c(2)]).axes);
  // Prefer the axis-aligned box unless PCA is clearly (2 %) tighter: stable across LODs.
  return pca.volume < aabb.volume * 0.98 ? pca : aabb;
}

/** Sphere about the box centre or the point mean, whichever is smaller. */
export function fitSphere(points: readonly Vec3[], box: BoxFit): SphereFit {
  const n = points.length || 1;
  const mean = v3((k) => points.reduce((s, p) => s + p[k], 0) / n);
  const reach = (c: Vec3): number => {
    let r2 = 0;
    for (const p of points) r2 = Math.max(r2, dot(sub(p, c), sub(p, c)));
    return Math.sqrt(r2);
  };
  const best = [box.center, mean]
    .map((c) => ({ c, r: reach(c) }))
    .reduce((a, b) => (b.r < a.r - 1e-12 ? b : a));
  const radius = Math.max(MIN_SIZE / 2, best.r);
  return { kind: 'sphere', center: best.c, radius, volume: (4 / 3) * Math.PI * radius ** 3 };
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

function roundAlong(
  points: readonly Vec3[],
  box: BoxFit,
  k: 0 | 1 | 2,
  kind: RoundFit['kind'],
): RoundFit {
  const axis = box.axes[k];
  const c = box.center;
  let r2 = 0;
  for (const p of points) {
    const d = sub(p, c);
    const a = dot(d, axis);
    r2 = Math.max(r2, dot(d, d) - a * a);
  }
  const radius = Math.max(MIN_SIZE / 2, Math.sqrt(r2));
  const len = box.size[k];
  let height = len;
  if (kind === 'capsule') {
    // Cap centres at ±h/2: a point at axial a, radial ρ needs h/2 ≥ |a| − √(R² − ρ²).
    let half = 0;
    for (const p of points) {
      const d = sub(p, c);
      const a = dot(d, axis);
      const rho2 = Math.max(0, dot(d, d) - a * a);
      half = Math.max(half, Math.abs(a) - Math.sqrt(Math.max(0, radius * radius - rho2)));
    }
    height = Math.max(1e-4, 2 * half);
  }
  const volume =
    Math.PI * radius * radius * height + (kind === 'capsule' ? (4 / 3) * Math.PI * radius ** 3 : 0);
  return { kind, center: c, rotation: quatFromAxes(...frameWithY(axis)), height, radius, volume };
}

/** The smallest enclosing capsule or cylinder along one of the box's axes. */
export function fitRound(points: readonly Vec3[], box: BoxFit, kind: RoundFit['kind']): RoundFit {
  return ([0, 1, 2] as const)
    .map((k) => roundAlong(points, box, k, kind))
    .reduce((a, b) => (b.volume < a.volume - 1e-12 ? b : a));
}
