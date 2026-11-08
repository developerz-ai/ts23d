// Curve maths for creature recipes: Catmull-Rom splines through landmarks, arc-length resampling,
// Rodrigues rotation and bent arcs (horns, claws, fingers). Pure functions on Vec3 tuples.

import type { Vec3 } from '@developerz.ai/ts23d';

export const v3 = {
  add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  len: (a: Vec3): number => Math.hypot(a[0], a[1], a[2]),
  norm(a: Vec3): Vec3 {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a: Vec3, b: Vec3, t: number): Vec3 => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ],
  /** Mirror across y = 0 (left ↔ right). */
  flipY: (a: Vec3): Vec3 => [a[0], -a[1], a[2]],
};

/** Rotate `v` about unit `axis` by `rad` (Rodrigues). */
export function rotate(v: Vec3, axis: Vec3, rad: number): Vec3 {
  const k = v3.norm(axis);
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const kv = v3.cross(k, v);
  const kd = v3.dot(k, v) * (1 - c);
  return [
    v[0] * c + kv[0] * s + k[0] * kd,
    v[1] * c + kv[1] * s + k[1] * kd,
    v[2] * c + kv[2] * s + k[2] * kd,
  ];
}

/** Uniform Catmull-Rom through `pts` (ends clamped), `per` samples per span, last point included. */
export function spline(pts: readonly Vec3[], per: number): Vec3[] {
  if (pts.length < 2) return pts.map((p) => p);
  const out: Vec3[] = [];
  const at = (i: number): Vec3 => pts[Math.max(0, Math.min(pts.length - 1, i))] ?? [0, 0, 0];
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let s = 0; s < per; s++) {
      const t = s / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (k: 0 | 1 | 2): number =>
        0.5 *
        (2 * p1[k] +
          (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([f(0), f(1), f(2)]);
    }
  }
  out.push(at(pts.length - 1));
  return out;
}

/** Cumulative arc length, normalised to 0..1 per point. */
export function arcT(path: readonly Vec3[]): number[] {
  const d = [0];
  for (let i = 1; i < path.length; i++)
    d.push((d[i - 1] ?? 0) + v3.len(v3.sub(path[i] ?? [0, 0, 0], path[i - 1] ?? [0, 0, 0])));
  const total = d[d.length - 1] || 1;
  return d.map((x) => x / total);
}

/** Point at arc fraction t (0..1) along a polyline. */
export function pointAt(path: readonly Vec3[], t: number): Vec3 {
  const ts = arcT(path);
  for (let i = 1; i < path.length; i++) {
    const t1 = ts[i] ?? 1;
    if (t <= t1 || i === path.length - 1) {
      const t0 = ts[i - 1] ?? 0;
      const u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
      return v3.lerp(path[i - 1] ?? [0, 0, 0], path[i] ?? [0, 0, 0], u);
    }
  }
  return path[path.length - 1] ?? [0, 0, 0];
}

/** Unit tangent at arc fraction t. */
export function tangentAt(path: readonly Vec3[], t: number): Vec3 {
  const e = 0.01;
  return v3.norm(v3.sub(pointAt(path, Math.min(1, t + e)), pointAt(path, Math.max(0, t - e))));
}

/** `n` points evenly spaced by arc length. */
export function resample(path: readonly Vec3[], n: number): Vec3[] {
  return Array.from({ length: n }, (_, i) => pointAt(path, i / Math.max(1, n - 1)));
}

/**
 * A bent arc: starts at `base` heading `dir`, curls about `axis` by `bend` degrees in total over
 * `length` metres, optionally twisting the curl axis about the heading by `twist` degrees (a
 * corkscrew horn). `spiral` = 0 bends evenly (constant curvature); > 0 tightens the curl toward
 * the tip exponentially, a logarithmic spiral like real horn growth (curvature ∝ e^(spiral·t)).
 * `n` + 1 points.
 */
export function arc(
  base: Vec3,
  dir: Vec3,
  length: number,
  axis: Vec3,
  bend: number,
  n: number,
  twist = 0,
  spiral = 0,
): Vec3[] {
  const out: Vec3[] = [base];
  let d = v3.norm(dir);
  let ax = v3.norm(axis);
  let p = base;
  const step = length / n;
  const w = Array.from({ length: n }, (_, i) => Math.exp((spiral * (i + 0.5)) / n));
  const wsum = w.reduce((a, b) => a + b, 0);
  const dt = ((twist / n) * Math.PI) / 180;
  for (let i = 0; i < n; i++) {
    const db = ((bend * (w[i] ?? 1)) / wsum) * (Math.PI / 180);
    d = rotate(d, ax, db / 2);
    p = v3.add(p, v3.mul(d, step));
    d = rotate(d, ax, db / 2);
    ax = rotate(ax, d, dt);
    out.push(p);
  }
  return out;
}

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const mixRgb = (a: Vec3, b: Vec3, t: number): Vec3 => v3.lerp(a, b, t);
