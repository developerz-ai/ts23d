// Geometry helpers for the roadster: vector maths, centripetal Catmull-Rom splines, rigid
// rotations about any axis (hinges), mirrors, oriented boxes, tubes along smoothed paths and
// ring-of-instances placement. Everything here is pure and deterministic.

import {
  type Affine,
  applyAffine,
  beam,
  box,
  type Mesh,
  merge,
  place,
  type StripId,
  sweep,
  type Vec2,
  type Vec3,
} from '@developerz.ai/ts23d';

// ---------------------------------------------------------------- vectors
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
export const smooth = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const DEG = Math.PI / 180;

// ---------------------------------------------------------------- splines
/** Centripetal Catmull-Rom between p1 and p2 (Barry–Goldman), t ∈ [0, 1]. */
export function crPoint(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const knot = (a: Vec3, b: Vec3): number => Math.max(1e-6, Math.sqrt(len(sub(b, a))));
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const mix = (a: Vec3, b: Vec3, ta: number, tb: number): Vec3 =>
    lerp3(a, b, (tt - ta) / (tb - ta || 1));
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

/** Point at parameter u ∈ [0, n−1] on a spline through `pts` (ends extrapolated). */
export function splineAt(
  pts: readonly Vec3[],
  u: number,
  ghostStart?: Vec3,
  ghostEnd?: Vec3,
): Vec3 {
  const n = pts.length;
  if (n === 1) return pts[0] ?? [0, 0, 0];
  const uc = clamp(u, 0, n - 1);
  const i = Math.min(n - 2, Math.floor(uc));
  const t = uc - i;
  const p = (k: number): Vec3 => {
    if (k < 0) return ghostStart ?? sub(mul(pts[0] ?? [0, 0, 0], 2), pts[1] ?? [0, 0, 0]);
    if (k > n - 1) return ghostEnd ?? sub(mul(pts[n - 1] ?? [0, 0, 0], 2), pts[n - 2] ?? [0, 0, 0]);
    return pts[k] ?? [0, 0, 0];
  };
  return crPoint(p(i - 1), p(i), p(i + 1), p(i + 2), t);
}

/** Smooth polyline through `pts`, `per` samples per span (the knots are kept). */
export function spline(pts: readonly Vec3[], per: number): Vec3[] {
  if (pts.length < 3 || per <= 1) return [...pts];
  const out: Vec3[] = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++)
    for (let k = 0; k < per; k++) out.push(splineAt(pts, i + k / per));
  out.push(pts[n - 1] ?? [0, 0, 0]);
  return out;
}

/** 2D variant for profiles: a smooth polyline through (x, y) points. */
export function spline2(pts: readonly Vec2[], per: number): Vec2[] {
  return spline(
    pts.map(([a, b]): Vec3 => [a, b, 0]),
    per,
  ).map(([a, b]): Vec2 => [a, b]);
}

/** Piecewise-linear lookup over sorted knots [x, y][]. */
export function table(knots: readonly Vec2[], x: number): number {
  const first = knots[0] ?? [0, 0];
  if (x <= first[0]) return first[1];
  for (let i = 1; i < knots.length; i++) {
    const a = knots[i - 1] ?? first;
    const b = knots[i] ?? a;
    if (x <= b[0]) return lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0] || 1));
  }
  return (knots[knots.length - 1] ?? first)[1];
}

/** Smooth (Catmull-Rom) lookup over sorted knots [x, y][]. */
export function curve(knots: readonly Vec2[], x: number): number {
  const n = knots.length;
  const first = knots[0] ?? [0, 0];
  const last = knots[n - 1] ?? first;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  let i = 0;
  while (i < n - 2 && x > (knots[i + 1] ?? last)[0]) i++;
  const a = knots[i] ?? first;
  const b = knots[i + 1] ?? last;
  const t = (x - a[0]) / (b[0] - a[0] || 1);
  const p0 = knots[i - 1] ?? [2 * a[0] - b[0], 2 * a[1] - b[1]];
  const p3 = knots[i + 2] ?? [2 * b[0] - a[0], 2 * b[1] - a[1]];
  // Uniform Catmull-Rom on y with monotone x spacing (Hermite tangents scaled to the span).
  const m1 = ((b[1] - p0[1]) / (b[0] - p0[0] || 1)) * (b[0] - a[0]);
  const m2 = ((p3[1] - a[1]) / (p3[0] - a[0] || 1)) * (b[0] - a[0]);
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * a[1] +
    (t3 - 2 * t2 + t) * m1 +
    (-2 * t3 + 3 * t2) * b[1] +
    (t3 - t2) * m2
  );
}

// ---------------------------------------------------------------- transforms
/** Rodrigues rotation of `angle` radians about the axis through `origin` along `axis`. */
export function rotationAbout(origin: Vec3, axis: Vec3, angle: number): Affine {
  const [x, y, z] = unit(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const C = 1 - c;
  const m = [
    c + x * x * C,
    x * y * C - z * s,
    x * z * C + y * s,
    y * x * C + z * s,
    c + y * y * C,
    y * z * C - x * s,
    z * x * C - y * s,
    z * y * C + x * s,
    c + z * z * C,
  ] as const;
  const r = (v: Vec3): Vec3 => [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
  return { m, t: sub(origin, r(origin)) };
}

export const rotateAbout = (mesh: Mesh, origin: Vec3, axis: Vec3, angle: number): Mesh =>
  angle === 0 ? mesh : applyAffine(mesh, rotationAbout(origin, axis, angle));

/** Point rotated about an axis through origin. */
export function rotatePoint(p: Vec3, origin: Vec3, axis: Vec3, angle: number): Vec3 {
  const a = rotationAbout(origin, axis, angle);
  const { m, t } = a;
  return [
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + t[0],
    m[3] * p[0] + m[4] * p[1] + m[5] * p[2] + t[1],
    m[6] * p[0] + m[7] * p[1] + m[8] * p[2] + t[2],
  ];
}

/** Mirror across y = 0 (winding fixed by applyAffine). */
export const mirrorY = (mesh: Mesh): Mesh => place(mesh, { scale: [1, -1, 1] });

/** The mesh plus its mirror across y = 0. */
export const bothSides = (mesh: Mesh): Mesh => merge([mesh, mirrorY(mesh)]);

/** Translate a mesh. */
export const shift = (mesh: Mesh, by: Vec3): Mesh => place(mesh, { at: by });

/** A local frame (u, v, w columns) placed at `at`. */
export const inFrame = (mesh: Mesh, u: Vec3, v: Vec3, w: Vec3, at: Vec3): Mesh =>
  applyAffine(mesh, {
    m: [u[0], v[0], w[0], u[1], v[1], w[1], u[2], v[2], w[2]],
    t: at,
  });

/** Orient a mesh authored along +X (local X = `dir`) with local Z as close to `up` as possible. */
export function along(mesh: Mesh, at: Vec3, dir: Vec3, up: Vec3 = [0, 0, 1]): Mesh {
  const u = unit(dir);
  let w = sub(up, mul(u, dot(up, u)));
  if (len(w) < 1e-6) w = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  w = unit(sub(w, mul(u, dot(w, u))));
  const v = cross(w, u);
  return inFrame(mesh, u, v, w, at);
}

// ---------------------------------------------------------------- shapes
/** Axis-aligned box between two corners. */
export function bx(a: Vec3, b: Vec3, color: Vec3, strip: StripId = 'plastic', bevel = 0): Mesh {
  const lo: Vec3 = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
  const hi: Vec3 = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
  const size: Vec3 = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const small = Math.min(...size);
  return box({
    size,
    at: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]],
    color,
    strip,
    ...(bevel > 0 && bevel < small / 2 ? { bevel } : {}),
  });
}

/** Box of `size` centred at `c`, rotated by yaw/pitch/roll about its centre. */
export function obox(
  c: Vec3,
  size: Vec3,
  color: Vec3,
  strip: StripId = 'plastic',
  rot: { yaw?: number; pitch?: number; roll?: number } = {},
  bevel = 0,
): Mesh {
  const small = Math.min(...size);
  const m = box({
    size,
    at: [0, 0, -size[2] / 2],
    color,
    strip,
    ...(bevel > 0 && bevel < small / 2 ? { bevel } : {}),
  });
  return place(m, { at: c, ...rot });
}

/** Round bar between two points (beam with a round-ish section). */
export const rod = (
  from: Vec3,
  to: Vec3,
  d: number,
  color: Vec3,
  strip: StripId = 'chrome',
  segments = 8,
): Mesh =>
  sweep({
    section: { radius: d / 2, segments },
    path: [from, to],
    color,
    strip,
    caps: true,
  });

/** Square bar between two points. */
export const bar = (
  from: Vec3,
  to: Vec3,
  w: number,
  color: Vec3,
  strip: StripId = 'plastic',
): Mesh => beam({ from, to, width: w, color, strip });

/** Tube along a smoothed path through `pts`. */
export function tube(
  pts: readonly Vec3[],
  d: number,
  color: Vec3,
  strip: StripId = 'rubber',
  segments = 8,
  per = 4,
  caps = true,
): Mesh {
  const path = spline(pts, per);
  return sweep({ section: { radius: d / 2, segments }, path, color, strip, caps });
}

/** `n` copies of a mesh around the axis through `centre` along `axis`, starting at `phase`. */
export function ring(mesh: Mesh, n: number, centre: Vec3, axis: Vec3, phase = 0): Mesh {
  const out: Mesh[] = [];
  for (let i = 0; i < n; i++)
    out.push(rotateAbout(mesh, centre, axis, phase + (i / n) * Math.PI * 2));
  return merge(out);
}

/** Circle points in a plane given by two unit vectors. */
export function circle(c: Vec3, e1: Vec3, e2: Vec3, r: number, n: number, phase = 0): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    out.push(add(c, add(mul(e1, r * Math.cos(a)), mul(e2, r * Math.sin(a)))));
  }
  return out;
}

/** Rectangular bar from a to b, `w` wide and `h` tall. */
export const beamBetween = (
  a: Vec3,
  b: Vec3,
  w: number,
  h: number,
  color: Vec3,
  strip: StripId = 'plastic',
): Mesh => beam({ from: a, to: b, width: w, height: h, color, strip });
