// Brush strokes as sculpt edits: a polyline with a tapered radius that pushes the running field
// (everything folded before it) in or out. Each brush is a displacement d' = d ± depth · φ(s), s =
// distance to the path / radius, φ a falloff that is 0 for s ≥ 1 — so the stroke is exactly inert
// outside its influence sphere (the sparse fold skips it bit-identically) and its Lipschitz cost is
// provable: 1 + depth · max|φ'| · max over segments (1 + |Δr| / length) / r_min. That bound is
// DECLARED per stroke and summed by `sculpt` into the grid's culling bound; `probeLipschitz` is
// the sampling check that catches an under-declared one (the test uses it).

import type { Vec3 } from '../core/index.ts';
import { invalid } from './check.ts';
import type { Field } from './sdf-ops.ts';

export type StrokeBrush = 'crease' | 'clay' | 'inflate' | 'flatten' | 'pinch';

/**
 * crease: V-groove `depth` deep (eyelid fold, lip line, panel seam) · pinch: sharp ridge (brow
 * edge, knuckle) · inflate: smooth swell · clay: flat-topped layer `depth` thick · flatten: pulls
 * the surface toward the plane through the path's centroid with `normal`, by at most `depth`.
 */
export interface SculptStroke {
  readonly stroke: StrokeBrush;
  /** Polyline, metres, ≥ 2 points, no two consecutive equal. */
  readonly path: readonly Vec3[];
  /** Influence radius, metres: one value, or [start, end] tapered by arc length. */
  readonly radius: number | readonly [number, number];
  /** Metres of push at the path (> 0); the brush sets the direction. */
  readonly depth: number;
  /** flatten only: the plane's outward normal. */
  readonly normal?: Vec3;
  /** Override the sculpt's `mirror` for this stroke. */
  readonly mirror?: boolean;
}

export interface CompiledStroke {
  /** The running value d at p after the stroke. */
  readonly apply: (p: Vec3, d: number) => number;
  /** Influence sphere (unmirrored): outside it the stroke returns d unchanged. */
  readonly c: Vec3;
  readonly r: number;
  /** Declared bound on |∇d'| added to the input's own (d' Lipschitz ≤ L_d + extra). */
  readonly extra: number;
}

interface Profile {
  readonly phi: (s: number) => number;
  /** max |φ'(s)| over s ∈ [0, 1], rounded up. */
  readonly slope: number;
  /** +1 pushes the surface in (raises d), −1 out. */
  readonly sign: number;
}

const bump = (s: number): number => (1 - s * s) ** 3;
const PROFILES: Record<StrokeBrush, Profile> = {
  crease: { phi: (s) => (1 - s) ** 2, slope: 2, sign: 1 },
  pinch: { phi: (s) => (1 - s) ** 3, slope: 3, sign: -1 },
  // max |φ'| of (1 − s²)³ is 6 · 5^-½ · (4/5)² ≈ 1.7173 at s = 5^-½.
  inflate: { phi: bump, slope: 1.72, sign: -1 },
  // Plateau to s = ½, then smootherstep (C2) to 0: max |φ'| = 1.875 / ½.
  clay: {
    phi: (s) => {
      const u = s <= 0.5 ? 0 : (s - 0.5) / 0.5;
      return 1 - u * u * u * (10 - 15 * u + 6 * u * u);
    },
    slope: 3.75,
    sign: -1,
  },
  flatten: { phi: bump, slope: 1.72, sign: 1 },
};

export function compileStroke(e: SculptStroke, where: string, mirror: boolean): CompiledStroke {
  const prof = PROFILES[e.stroke];
  if (!prof)
    invalid(
      `${where}: unknown stroke '${e.stroke}'`,
      `use one of ${Object.keys(PROFILES).join(', ')}`,
    );
  const pts = e.path;
  if (pts.length < 2 || !pts.every((q) => q.every(Number.isFinite)))
    invalid(
      `${where}: path needs ≥ 2 finite points`,
      'give path: [[x, y, z], [x, y, z], …] in metres',
    );
  const [r0, r1] = typeof e.radius === 'number' ? [e.radius, e.radius] : e.radius;
  if (!(r0 > 0 && r1 > 0 && Number.isFinite(r0) && Number.isFinite(r1)))
    invalid(
      `${where}: radius ${String(e.radius)} is not > 0`,
      'give radius in metres, e.g. 0.01 or [0.012, 0.004]',
    );
  if (!(e.depth > 0 && Number.isFinite(e.depth)))
    invalid(
      `${where}: depth is ${e.depth}`,
      'give depth > 0 in metres; the brush sets the direction',
    );
  // Segments as flat arrays: a, unit direction, length, radius at each end.
  const n = pts.length - 1;
  const seg = new Float64Array(n * 9);
  const lens: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i] ?? [0, 0, 0];
    const b = pts[i + 1] ?? a;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (!(len > 0))
      invalid(`${where}: path points ${i} and ${i + 1} coincide`, 'drop the repeated point');
    lens.push(len);
  }
  const total = lens.reduce((s, l) => s + l, 0);
  let run = 0;
  let worst = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i] ?? [0, 0, 0];
    const b = pts[i + 1] ?? a;
    const len = lens[i] ?? 1;
    const ra = r0 + ((r1 - r0) * run) / total;
    run += len;
    const rb = r0 + ((r1 - r0) * run) / total;
    seg.set(
      [
        a[0],
        a[1],
        a[2],
        (b[0] - a[0]) / len,
        (b[1] - a[1]) / len,
        (b[2] - a[2]) / len,
        len,
        ra,
        rb,
      ],
      i * 9,
    );
    worst = Math.max(worst, (1 + Math.abs(rb - ra) / len) / Math.min(ra, rb));
  }
  const falloff = (x: number, y: number, z: number): number => {
    let w = 0;
    for (let i = 0; i < seg.length; i += 9) {
      const px = x - (seg[i] ?? 0);
      const py = y - (seg[i + 1] ?? 0);
      const pz = z - (seg[i + 2] ?? 0);
      const len = seg[i + 6] ?? 0;
      const t0 = px * (seg[i + 3] ?? 0) + py * (seg[i + 4] ?? 0) + pz * (seg[i + 5] ?? 0);
      const t = t0 < 0 ? 0 : Math.min(t0, len);
      const ra = seg[i + 7] ?? 1;
      const r = ra + ((seg[i + 8] ?? 1) - ra) * (t / len);
      const qx = px - (seg[i + 3] ?? 0) * t;
      const qy = py - (seg[i + 4] ?? 0) * t;
      const qz = pz - (seg[i + 5] ?? 0) * t;
      const s = Math.sqrt(qx * qx + qy * qy + qz * qz) / r;
      if (s < 1) w = Math.max(w, prof.phi(s));
    }
    return w;
  };
  const m = e.mirror ?? mirror;
  const weight = m
    ? (p: Vec3): number => Math.max(falloff(p[0], p[1], p[2]), falloff(p[0], -p[1], p[2]))
    : (p: Vec3): number => falloff(p[0], p[1], p[2]);
  const lo = [0, 1, 2].map((k) => Math.min(...pts.map((q) => q[k] ?? 0)));
  const hi = [0, 1, 2].map((k) => Math.max(...pts.map((q) => q[k] ?? 0)));
  const c: Vec3 = [
    ((lo[0] ?? 0) + (hi[0] ?? 0)) / 2,
    ((lo[1] ?? 0) + (hi[1] ?? 0)) / 2,
    ((lo[2] ?? 0) + (hi[2] ?? 0)) / 2,
  ];
  const r =
    Math.hypot((hi[0] ?? 0) - c[0], (hi[1] ?? 0) - c[1], (hi[2] ?? 0) - c[2]) + Math.max(r0, r1);
  const depth = e.depth;
  const extra = depth * prof.slope * worst;
  if (e.stroke !== 'flatten') {
    const k = prof.sign * depth;
    return {
      apply: (p, d) => {
        const w = weight(p);
        return w === 0 ? d : d + k * w;
      },
      c,
      r,
      extra,
    };
  }
  const nv = e.normal;
  const nl = nv ? Math.hypot(nv[0], nv[1], nv[2]) : 0;
  if (!nv || !(nl > 0) || !Number.isFinite(nl))
    invalid(
      `${where}: flatten needs a non-zero normal`,
      'add normal: [x, y, z], the outward side of the plane',
    );
  const [nx, ny, nz] = [nv[0] / nl, nv[1] / nl, nv[2] / nl];
  const cen = [0, 1, 2].map((k) => pts.reduce((s, q) => s + (q[k] ?? 0), 0) / pts.length);
  const off = nx * (cen[0] ?? 0) + ny * (cen[1] ?? 0) + nz * (cen[2] ?? 0);
  const flat = (p: Vec3, d: number): number => {
    const w = weight(p);
    if (w === 0) return d;
    // Mirrored strokes flatten against the mirrored plane on the far side.
    const y = m && p[1] * (cen[1] ?? 0) < 0 ? -p[1] : p[1];
    const gap = nx * p[0] + ny * y + nz * p[2] - off - d;
    return d + w * (gap > depth ? depth : Math.max(gap, -depth));
  };
  return { apply: flat, c, r, extra };
}

/** Distance from the stroke's bounds to grow a sculpt's bounds (strokes can add `depth`). */
export function strokeBounds(e: SculptStroke, mirror: boolean): [Vec3, Vec3] {
  const s = compileStroke(e, 'stroke', mirror);
  const g = s.r + e.depth;
  const lo: [number, number, number] = [s.c[0] - g, s.c[1] - g, s.c[2] - g];
  const hi: [number, number, number] = [s.c[0] + g, s.c[1] + g, s.c[2] + g];
  if (e.mirror ?? mirror) {
    lo[1] = Math.min(lo[1], -hi[1]);
    hi[1] = Math.max(hi[1], -lo[1]);
  }
  return [lo, hi];
}

/**
 * Sampled check of a declared Lipschitz bound: the steepest |Δf| / |Δp| over a fixed lattice of
 * point pairs (steps along 13 directions, deterministic) inside `bounds`. `ok` is false when the
 * field is measurably steeper than `declared` — the bound would let the grid cull real surface.
 */
export function probeLipschitz(
  f: Field,
  bounds: readonly [Vec3, Vec3],
  declared: number,
  steps = 24,
): { worst: number; ok: boolean } {
  const [lo, hi] = bounds;
  const eps = 1e-5 * Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const dirs: Vec3[] = [];
  for (const x of [-1, 0, 1])
    for (const y of [-1, 0, 1])
      for (const z of [0, 1]) if (z === 1 || y === 1 || (y === 0 && x === 1)) dirs.push([x, y, z]);
  const p: [number, number, number] = [0, 0, 0];
  let worst = 0;
  for (let k = 0; k <= steps; k++)
    for (let j = 0; j <= steps; j++)
      for (let i = 0; i <= steps; i++) {
        const x = lo[0] + ((hi[0] - lo[0]) * i) / steps;
        const y = lo[1] + ((hi[1] - lo[1]) * j) / steps;
        const z = lo[2] + ((hi[2] - lo[2]) * k) / steps;
        p[0] = x;
        p[1] = y;
        p[2] = z;
        const v = f(p);
        for (const d of dirs) {
          const l = Math.hypot(d[0], d[1], d[2]);
          p[0] = x + (eps * d[0]) / l;
          p[1] = y + (eps * d[1]) / l;
          p[2] = z + (eps * d[2]) / l;
          worst = Math.max(worst, Math.abs(f(p) - v) / eps);
        }
      }
  return { worst, ok: worst <= declared * (1 + 1e-3) };
}
