// Parallel-transport frames along a polyline (double reflection, Wang et al. 2008): the section
// never twist-flips at inflections the way Frenet frames do. Shared by `sweep` and by kinds that
// must place things exactly on a swept surface (leaves on twigs, children on branches).

import { Ts23dError, type Vec3 } from '../core/index.ts';

export interface SweepFrame {
  /** Unit tangent. */
  readonly t: Vec3;
  /** Unit normal: section X. */
  readonly n: Vec3;
  /** Unit binormal t × n: section Y. */
  readonly b: Vec3;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const reflect = (v: Vec3, axis: Vec3, c: number): Vec3 => {
  const k = (2 / c) * dot(axis, v);
  return [v[0] - k * axis[0], v[1] - k * axis[1], v[2] - k * axis[2]];
};

/** Throws unless the path has ≥ 2 points and no zero-length segment. Returns cumulative lengths. */
export function arcLengths(path: readonly Vec3[]): number[] {
  if (path.length < 2) {
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `sweep path has ${path.length} point(s)`,
      fix: 'pass at least 2 path points (from → to); a single point has no direction to sweep along',
    });
  }
  const s = [0];
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(...sub(path[i] ?? [0, 0, 0], path[i - 1] ?? [0, 0, 0]));
    if (d < 1e-9) {
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `sweep path points ${i - 1} and ${i} coincide (zero-length segment)`,
        fix: 'make consecutive path points distinct — drop duplicates before sweeping',
      });
    }
    s.push((s[i - 1] ?? 0) + d);
  }
  return s;
}

/**
 * One frame per path point. The first normal comes from world X when the path starts near
 * vertical, else world Z, so a path in the XZ plane keeps b = ±Y all the way (trunk widths
 * measured across Y stay exact).
 */
export function transportFrames(path: readonly Vec3[]): SweepFrame[] {
  arcLengths(path);
  const last = path.length - 1;
  const tangents = path.map((_, i) =>
    unit(sub(path[Math.min(last, i + 1)] ?? [0, 0, 0], path[Math.max(0, i - 1)] ?? [0, 0, 0])),
  );
  const t0 = tangents[0] ?? [0, 0, 1];
  const ref: Vec3 = Math.abs(t0[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const k = dot(ref, t0);
  let n = unit([ref[0] - k * t0[0], ref[1] - k * t0[1], ref[2] - k * t0[2]]);
  const out: SweepFrame[] = [{ t: t0, n, b: cross(t0, n) }];
  for (let i = 1; i <= last; i++) {
    const p0 = path[i - 1] ?? [0, 0, 0];
    const p1 = path[i] ?? [0, 0, 0];
    const ti = tangents[i - 1] ?? t0;
    const tj = tangents[i] ?? t0;
    const v1 = sub(p1, p0);
    const c1 = dot(v1, v1);
    const nL = reflect(n, v1, c1);
    const tL = reflect(ti, v1, c1);
    const v2 = sub(tj, tL);
    const c2 = dot(v2, v2);
    n = unit(c2 < 1e-12 ? nL : reflect(nL, v2, c2));
    out.push({ t: tj, n, b: cross(tj, n) });
  }
  return out;
}
