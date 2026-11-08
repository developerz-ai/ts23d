// Bust sculpting kit (shared by the head busts): the brushes this recipe sculpts with, as SDF edits for `sculpt`.
// Clay (tapered round-cone chains: muscles, tusks, horns, straps), crease (a thin chain carved with
// a small fillet: eyelid folds, wrinkles, plate seams), scrape (a half-space intersected with a
// fillet: flatten the head's sides, the forehead plane), and small vector helpers. All metres,
// Z up, +X front. Pure functions of their arguments, so the sculpt stays deterministic.

import type { Field, SculptEdit, Vec3 } from '@developerz.ai/ts23d';

export type V = Vec3;

export const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
export const lerp = (a: V, b: V, t: number): V => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export const len = (a: V): number => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V): V => mul(a, 1 / (len(a) || 1));
export const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V, b: V): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
/** Mirror a point across y = 0 (left → right). */
export const flipY = (a: V): V => [a[0], -a[1], a[2]];
export const scaleC = (c: V, k: number): V => [c[0] * k, c[1] * k, c[2] * k];

type Op = 'add' | 'subtract' | 'intersect' | 'paint';
export interface Brush {
  readonly op?: Op;
  readonly blend?: number;
  readonly color?: V;
  readonly mirror?: boolean;
}
/** A brush applied as a group (no paint op on groups). */
export interface GroupBrush {
  readonly op?: 'add' | 'subtract' | 'intersect';
  readonly blend?: number;
  readonly color?: V;
  readonly mirror?: boolean;
}

/** Exact distance to a round cone: sphere ra at a, sphere rb at b, tangent cone between
 *  (Quílez, "round cone, arbitrary orientation"). */
export function roundConeField(a: V, b: V, ra: number, rb: number): Field {
  const ba = sub(b, a);
  const l2 = dot(ba, ba);
  const rr = ra - rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const [bx, by, bz] = ba;
  return (p) => {
    const px = p[0] - a[0];
    const py = p[1] - a[1];
    const pz = p[2] - a[2];
    const y = px * bx + py * by + pz * bz;
    const z = y - l2;
    const qx = px * l2 - bx * y;
    const qy = py * l2 - by * y;
    const qz = pz * l2 - bz * y;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = y * y * l2;
    const z2 = z * z * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
    if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
    return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - ra;
  };
}

/** One round cone a → b as a sculpt edit (a degenerate pair becomes a sphere). */
export function cone2(a: V, b: V, ra: number, rb: number, o: Brush = {}): SculptEdit {
  const r = Math.max(ra, rb);
  if (len(sub(b, a)) < Math.abs(ra - rb) + 1e-6)
    return { shape: 'sphere', at: ra >= rb ? a : b, size: r, ...o };
  const pad = r + 1e-3;
  return {
    field: roundConeField(a, b, ra, rb),
    bounds: [
      [Math.min(a[0], b[0]) - pad, Math.min(a[1], b[1]) - pad, Math.min(a[2], b[2]) - pad],
      [Math.max(a[0], b[0]) + pad, Math.max(a[1], b[1]) + pad, Math.max(a[2], b[2]) + pad],
    ],
    ...o,
  };
}

/** A clay strip / draw-skin: round cones through `pts` with a radius per point, as one group
 *  (unioned with `join` fillet), applied with the brush op. */
export function chain(
  pts: readonly V[],
  radii: number | readonly number[],
  o: GroupBrush & { readonly join?: number } = {},
): SculptEdit {
  const r = (i: number): number => (typeof radii === 'number' ? radii : (radii[i] ?? 0.01));
  // ONE field edit for the whole stroke (round cones share their end spheres, so a plain min is
  // already smooth): one node in the sculpt tree instead of one per segment, and each segment is
  // skipped by its bounding sphere — strokes cost little however finely they are sampled.
  const segs: Array<{ f: Field; c: V; R: number }> = [];
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!a || !b) continue;
    const ra = r(i);
    const rb = r(i + 1);
    const degenerate = len(sub(b, a)) < Math.abs(ra - rb) + 1e-6;
    const big = ra >= rb ? a : b;
    const rr = Math.max(ra, rb);
    const f: Field = degenerate
      ? (p) => Math.hypot(p[0] - big[0], p[1] - big[1], p[2] - big[2]) - rr
      : roundConeField(a, b, ra, rb);
    const c = mul(add(a, b), 0.5);
    segs.push({ f, c, R: len(sub(b, a)) / 2 + rr });
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k] ?? 0, (a[k] ?? 0) - ra, (b[k] ?? 0) - rb);
      hi[k] = Math.max(hi[k] ?? 0, (a[k] ?? 0) + ra, (b[k] ?? 0) + rb);
    }
  }
  const { join: _join, ...brush } = o;
  if (segs.length === 0) return { shape: 'sphere', at: pts[0] ?? [0, 0, 0], size: r(0), ...brush };
  // Chunks of 6 segments under one bounding sphere: far chunks cost one distance.
  const chunks: Array<{ c: V; R: number; s: typeof segs }> = [];
  for (let i = 0; i < segs.length; i += 6) {
    const part = segs.slice(i, i + 6);
    const c = mul(
      part.reduce((acc, s) => add(acc, s.c), [0, 0, 0] as V),
      1 / part.length,
    );
    const R = Math.max(...part.map((s) => len(sub(s.c, c)) + s.R));
    chunks.push({ c, R, s: part });
  }
  const field: Field = (p) => {
    let best = Number.POSITIVE_INFINITY;
    for (const ch of chunks) {
      if (Math.hypot(p[0] - ch.c[0], p[1] - ch.c[1], p[2] - ch.c[2]) - ch.R >= best) continue;
      for (const s of ch.s) {
        const dc = Math.hypot(p[0] - s.c[0], p[1] - s.c[1], p[2] - s.c[2]) - s.R;
        if (dc >= best) continue;
        const d = s.f(p);
        if (d < best) best = d;
      }
    }
    return best;
  };
  const pad = 1e-3;
  return {
    field,
    bounds: [
      [lo[0] - pad, lo[1] - pad, lo[2] - pad],
      [hi[0] + pad, hi[1] + pad, hi[2] + pad],
    ],
    ...brush,
  };
}

/** Length of a polyline. */
export function pathLength(pts: readonly V[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a && b) s += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return s;
}

/** Catmull-Rom resample of a control polyline into `n` points (smooth strokes from few knots). */
export function spline(ctrl: readonly V[], n: number): V[] {
  const out: V[] = [];
  const m = ctrl.length - 1;
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * m;
    const k = Math.min(Math.floor(t), m - 1);
    const u = t - k;
    const p0 = ctrl[Math.max(k - 1, 0)] ?? [0, 0, 0];
    const p1 = ctrl[k] ?? p0;
    const p2 = ctrl[k + 1] ?? p1;
    const p3 = ctrl[Math.min(k + 2, m)] ?? p2;
    const c = (j: 0 | 1 | 2): number =>
      0.5 *
      (2 * p1[j] +
        (-p0[j] + p2[j]) * u +
        (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * u * u +
        (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * u * u * u);
    out.push([c(0), c(1), c(2)]);
  }
  return out;
}

/** Interpolated radii along a stroke: from r0 to r1 with a sine swell of `belly`. */
export function taper(n: number, r0: number, r1: number, belly = 0): number[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / Math.max(n - 1, 1);
    return r0 + (r1 - r0) * t + belly * Math.sin(Math.PI * t);
  });
}

/** Crease (DamStandard): a thin tapered groove along a smooth stroke, carved with a fillet. */
export function crease(
  ctrl: readonly V[],
  r: number,
  o: GroupBrush & { readonly n?: number; readonly tips?: number } = {},
): SculptEdit {
  const n = o.n ?? Math.max(4, ctrl.length * 3, Math.ceil(pathLength(ctrl) / (r * 3)));
  const tip = o.tips ?? 0.35;
  const radii = Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return r * (tip + (1 - tip) * Math.sin(Math.PI * t));
  });
  const { n: _n, tips: _t, ...brush } = o;
  return chain(spline(ctrl, n), radii, { op: 'subtract', blend: r * 0.8, ...brush });
}

/** Clay strip: a raised tapered ridge along a smooth stroke (muscle edge, vein, lid, scar). */
export function clay(
  ctrl: readonly V[],
  r: number,
  o: GroupBrush & { readonly n?: number; readonly tips?: number } = {},
): SculptEdit {
  const n = o.n ?? Math.max(4, ctrl.length * 3, Math.ceil(pathLength(ctrl) / (r * 3)));
  const tip = o.tips ?? 0.3;
  const radii = Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return r * (tip + (1 - tip) * Math.sin(Math.PI * t));
  });
  const { n: _n, tips: _t, ...brush } = o;
  return chain(spline(ctrl, n), radii, { blend: r * 1.2, ...brush });
}

/** Scrape: keep only the side of the plane through `at` that `n` points away from, with a
 *  fillet `blend`, over a cube of half-size `reach` (intersect inside a group = flatten only it). */
export function scrape(at: V, n: V, reach: number, blend: number): SculptEdit {
  const u = norm(n);
  return {
    field: (p) => (p[0] - at[0]) * u[0] + (p[1] - at[1]) * u[1] + (p[2] - at[2]) * u[2],
    bounds: [
      [at[0] - reach, at[1] - reach, at[2] - reach],
      [at[0] + reach, at[1] + reach, at[2] + reach],
    ],
    op: 'intersect',
    blend,
  };
}

/** Ellipsoid edit with an optional rotation (deg about X, Y, Z). */
export const ell = (at: V, r: V, o: Brush & { readonly rotate?: V } = {}): SculptEdit => ({
  shape: 'ellipsoid',
  at,
  size: r,
  ...o,
});

export const ball = (at: V, r: number, o: Brush = {}): SculptEdit => ({
  shape: 'sphere',
  at,
  size: r,
  ...o,
});

export const rbox = (
  at: V,
  size: V,
  round: number,
  o: Brush & { readonly rotate?: V } = {},
): SculptEdit => ({ shape: 'roundBox', at, size, round, ...o });

/** `rotate` (deg, X→Y→Z) taking local +Z (a cone's axis) onto direction `d`. */
export function alongZ(d: V): V {
  const u = norm(d);
  const tilt = Math.acos(Math.max(-1, Math.min(1, u[2])));
  return [0, (tilt * 180) / Math.PI, (Math.atan2(u[1], u[0]) * 180) / Math.PI];
}

/** A local frame: origin + orthonormal axes (u, v, w), built from a main axis and a hint. */
export interface Frame {
  readonly o: V;
  readonly u: V;
  readonly v: V;
  readonly w: V;
}

export function frameOf(o: V, along: V, facing: V): Frame {
  const u = norm(along);
  const w = norm(sub(facing, mul(u, dot(facing, u))));
  return { o, u, v: cross(w, u), w };
}

/** Local (u, v, w) → world point. */
export const at = (f: Frame, u: number, v: number, w: number): V =>
  add(add(add(f.o, mul(f.u, u)), mul(f.v, v)), mul(f.w, w));

/**
 * A field defined in a frame's local coords, squashed along w by `squash` (≥ 1: a flattened
 * shape, its distance divided by squash so it stays ≤ 1-Lipschitz), as a sculpt edit inside a
 * local box [lo, hi] (u, v, w ranges before squashing).
 */
export function local(
  f: Frame,
  shape: (u: number, v: number, w: number) => number,
  box: readonly [V, V],
  o: Brush & { readonly squash?: number } = {},
): SculptEdit {
  const s = o.squash ?? 1;
  const { o: c, u, v, w } = f;
  const field: Field = (p) => {
    const dx = p[0] - c[0];
    const dy = p[1] - c[1];
    const dz = p[2] - c[2];
    return (
      shape(
        dx * u[0] + dy * u[1] + dz * u[2],
        dx * v[0] + dy * v[1] + dz * v[2],
        (dx * w[0] + dy * w[1] + dz * w[2]) * s,
      ) / s
    );
  };
  const lo: number[] = [Infinity, Infinity, Infinity];
  const hi: number[] = [-Infinity, -Infinity, -Infinity];
  for (const a of [box[0][0], box[1][0]])
    for (const b of [box[0][1], box[1][1]])
      for (const d of [box[0][2] / s, box[1][2] / s]) {
        const q = at(f, a, b, d);
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k] ?? 0, q[k] ?? 0);
          hi[k] = Math.max(hi[k] ?? 0, q[k] ?? 0);
        }
      }
  const { squash: _s, ...brush } = o;
  return {
    field,
    bounds: [
      [lo[0] ?? 0, lo[1] ?? 0, lo[2] ?? 0],
      [hi[0] ?? 0, hi[1] ?? 0, hi[2] ?? 0],
    ],
    ...brush,
  };
}

/** Local-coordinate shape kernels for `local`. */
export const k = {
  ellipsoid:
    (cu: number, cv: number, cw: number, ru: number, rv: number, rw: number) =>
    (u: number, v: number, w: number): number => {
      const x = u - cu;
      const y = v - cv;
      const z = w - cw;
      const k0 = Math.sqrt((x / ru) ** 2 + (y / rv) ** 2 + (z / rw) ** 2);
      const k1 = Math.sqrt((x / (ru * ru)) ** 2 + (y / (rv * rv)) ** 2 + (z / (rw * rw)) ** 2);
      return k1 === 0 ? -Math.min(ru, rv, rw) : (k0 * (k0 - 1)) / k1;
    },
  roundCone(a: V, b: V, ra: number, rb: number) {
    const f = roundConeField(a, b, ra, rb);
    const q: [number, number, number] = [0, 0, 0];
    return (u: number, v: number, w: number): number => {
      q[0] = u;
      q[1] = v;
      q[2] = w;
      return f(q);
    };
  },
  box(c: V, h: V, r: number) {
    return (u: number, v: number, w: number): number => {
      const qx = Math.abs(u - c[0]) - h[0] + r;
      const qy = Math.abs(v - c[1]) - h[1] + r;
      const qz = Math.abs(w - c[2]) - h[2] + r;
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const oz = Math.max(qz, 0);
      return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
    };
  },
};

/** A surface to stroke on: projects points onto the zero set of `field` (the forms so far) and
 *  gives the outward normal, so creases and clay strips follow the real skin, never float. */
export interface Surface {
  readonly field: Field;
  /** Project `p` onto the surface (Newton steps along the gradient). */
  on(p: V): V;
  normal(p: V): V;
  /** Project, then move `off` metres along the outward normal (negative = into the skin). */
  off(p: V, off: number): V;
}

export function surface(field: Field): Surface {
  const e = 5e-4;
  const grad = (p: V): V => [
    field([p[0] + e, p[1], p[2]]) - field([p[0] - e, p[1], p[2]]),
    field([p[0], p[1] + e, p[2]]) - field([p[0], p[1] - e, p[2]]),
    field([p[0], p[1], p[2] + e]) - field([p[0], p[1], p[2] - e]),
  ];
  const on = (p: V): V => {
    let q = p;
    for (let i = 0; i < 12; i++) {
      const d = field(q);
      if (Math.abs(d) < 1e-5) break;
      const n = norm(grad(q));
      q = sub(q, mul(n, d));
    }
    return q;
  };
  const normal = (p: V): V => norm(grad(p));
  return {
    field,
    on,
    normal,
    off: (p, o) => {
      const q = on(p);
      return add(q, mul(normal(q), o));
    },
  };
}

/** Crease ON a surface: the stroke's knots are projected onto the skin and the groove cuts
 *  `depth` metres deep (centre line at r − depth outside the skin). */
export function creaseOn(
  s: Surface,
  ctrl: readonly V[],
  r: number,
  depth: number,
  o: GroupBrush & { readonly n?: number; readonly tips?: number } = {},
): SculptEdit {
  const n = Math.max(o.n ?? 0, ctrl.length * 3, Math.ceil(pathLength(ctrl) / (r * 3)));
  const pts = spline(ctrl, n).map((p) => s.off(p, r - depth));
  return crease(pts, r, { ...o, n });
}

/** Clay strip ON a surface: a ridge standing `height` metres proud of the skin. */
export function clayOn(
  s: Surface,
  ctrl: readonly V[],
  r: number,
  height: number,
  o: GroupBrush & { readonly n?: number; readonly tips?: number } = {},
): SculptEdit {
  const n = Math.max(o.n ?? 0, ctrl.length * 3, Math.ceil(pathLength(ctrl) / (r * 3)));
  const pts = spline(ctrl, n).map((p) => s.off(p, height - r));
  return clay(pts, r, { ...o, n });
}

/** Points on the curve e = 0 ∩ c = 0, from seeds round it (alternating projection). */
export function onCurve(e: Field, c: Field, seeds: readonly V[]): V[] {
  const h = 4e-4;
  const g = (f: Field, p: V): V =>
    norm([
      f([p[0] + h, p[1], p[2]]) - f([p[0] - h, p[1], p[2]]),
      f([p[0], p[1] + h, p[2]]) - f([p[0], p[1] - h, p[2]]),
      f([p[0], p[1], p[2] + h]) - f([p[0], p[1], p[2] - h]),
    ]);
  return seeds.map((s0) => {
    let p = s0;
    for (let i = 0; i < 30; i++) {
      p = sub(p, mul(g(e, p), e(p)));
      p = sub(p, mul(g(c, p), c(p)));
    }
    return p;
  });
}
