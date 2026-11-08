// Curve and colour maths for the creature kind (ported from recipes/_lib/creature/curve.ts): Vec3
// helpers, Catmull-Rom splines through landmarks, arc-length fractions, a bent arc for claws and
// teeth, smoothstep/mix and an integer hash for seeded patterns. Pure functions on Vec3 tuples.

import type { Vec3 } from '../core/index.ts';

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

/** Total length of a polyline. */
export function pathLength(path: readonly Vec3[]): number {
  let s = 0;
  for (let i = 1; i < path.length; i++)
    s += v3.len(v3.sub(path[i] ?? [0, 0, 0], path[i - 1] ?? [0, 0, 0]));
  return s;
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

/** A bent arc from `base` heading `dir`, curling about `axis` by `bend` degrees over `length`. */
export function arc(base: Vec3, dir: Vec3, length: number, axis: Vec3, bend: number, n: number) {
  const out: Vec3[] = [base];
  let d = v3.norm(dir);
  let p = base;
  const step = length / n;
  const db = ((bend / n) * Math.PI) / 180;
  for (let i = 0; i < n; i++) {
    d = rotate(d, axis, db / 2);
    p = v3.add(p, v3.mul(d, step));
    d = rotate(d, axis, db / 2);
    out.push(p);
  }
  return out;
}

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export const mixRgb = (a: Vec3, b: Vec3, t: number): Vec3 => v3.lerp(a, b, clamp01(t));

/** Integer hash of (i, j, seed) → [0, 1). Deterministic, order-free. */
export function hash(i: number, j: number, seed: number): number {
  let h = (i * 374761393 + j * 668265263 + seed * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
