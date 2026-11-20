// Field → low-mesh texture bake (ADR 012's hero tier): for each texel of the low mesh's UV layout
// (bake-texels.ts) march the signed-distance field along the low normal from the surface point,
// inside a ±cage window, to the nearest zero crossing (a safe |f|/L step, secant steps along the
// ray, Illinois false position once bracketed). At the hit: normal = ∇f (tetrahedral stencil of `cell`)
// in the low frame's tangent space; height = signed offset along +n (metres, + out); the source's colour; mean
// curvature H = ½∇²f from the same samples; AO from four samples up the normal (Quilez's SDF
// occlusion). The field is only evaluated near the surface, never meshed. Texels whose ray finds
// no crossing inside the cage are misses (`hit` = 0): the low normal, height 0, AO 1.
// Deterministic: fixed texel order, fixed stencils, no randomness.

import { dmath, type Mesh, Ts23dError, type Vec3 } from '../core/index.ts';
import type { DistanceField } from './bake-field.ts';
import { uvTangents } from './bake-tangents.ts';
import { walkTexels } from './bake-texels.ts';

export interface HeightBakeOptions {
  /** Square texture size in texels (power of two, 16…4096). */
  readonly size: number;
  /** Finite-difference step = the finest detail kept, metres (1–2 mm on a hero). */
  readonly cell: number;
  /** Search window along ±n from the low surface, metres. Default 8 cells. */
  readonly cage?: number;
  /** Upper bound on |∇f| (sculpt fields: their `lipschitz`). Default 1.25. */
  readonly lipschitz?: number;
  /** The low mesh's VEC4 tangents (the exporter's); default uvTangents(low). */
  readonly tangents?: Float32Array;
  /** AO reach up the normal, metres; 0 = no AO. Default 12 cells. */
  readonly aoReach?: number;
  /** Bake only the first `tris` triangles (the rest were not meshed from this field). */
  readonly tris?: number;
  /** Surface colour at the hit (linear RGB): fills `color`. */
  readonly color?: (p: Vec3) => Vec3;
}

export interface HeightBake {
  readonly size: number;
  /** RGBA8 tangent-space normal (glTF green-up); uncovered texels flat. */
  readonly normal: Uint8Array;
  /** Metres along +n from the low surface to the field's surface. */
  readonly height: Float32Array;
  /** Mean curvature 1/m (+ convex). */
  readonly curvature: Float32Array;
  /** 0..1 visibility. */
  readonly ao: Float32Array;
  /** Linear RGB per texel at the hit, −1 where none (only with `color`). */
  readonly color?: Float32Array;
  /** Texels of the UV layout (all triangles, `tris` or not). */
  readonly covered: Uint8Array;
  readonly hit: Uint8Array;
  /** Hits ÷ texels of the baked triangles. */
  readonly hitRate: number;
  readonly cage: number;
}

const K = [
  [1, -1, -1],
  [-1, -1, 1],
  [-1, 1, -1],
  [1, 1, 1],
] as const;

/**
 * Signed offset s ∈ [−cage, cage] along unit n where f(p + s·n) = 0 nearest p; null = none.
 * Steps toward the surface — the safe |f|/L first, then the secant estimate along the ray capped
 * at 4|f| — until a sign change brackets the root, then Illinois false position to |f| < eps.
 * `out.v` receives f at the returned point.
 */
export function fieldHit(
  f: DistanceField,
  p: Vec3,
  n: Vec3,
  cage: number,
  lipschitz = 1.25,
  eps = 1e-5,
  out?: { v: number },
): number | null {
  const q: [number, number, number] = [p[0], p[1], p[2]];
  const at = (s: number): number => {
    q[0] = p[0] + n[0] * s;
    q[1] = p[1] + n[1] * s;
    q[2] = p[2] + n[2] * s;
    return f(q);
  };
  const done = (s: number, v: number): number => {
    if (out) out.v = v;
    return s;
  };
  const f0 = at(0);
  if (Math.abs(f0) < eps) return done(0, f0);
  const dir = f0 > 0 ? -1 : 1;
  let s = 0;
  let v = f0;
  let step = Math.abs(v) / lipschitz;
  for (let k = 0; k < 64; k++) {
    const s1 = s + dir * Math.max(step, eps * 0.5);
    if (Math.abs(s1) > cage) return null;
    const v1 = at(s1);
    if (Math.abs(v1) < eps) return done(s1, v1);
    if (Math.sign(v1) !== Math.sign(v)) {
      // Bracketed: Illinois false position inside [s, s1] until |f| < eps.
      let a = s;
      let fa = v;
      let b = s1;
      let fb = v1;
      for (let j = 0; j < 16 && Math.abs(fb) >= eps; j++) {
        const m = b - (fb * (b - a)) / (fb - fa);
        const fm = at(m);
        if (Math.sign(fm) === Math.sign(fb)) fa *= 0.5;
        else {
          a = b;
          fa = fb;
        }
        b = m;
        fb = fm;
      }
      return Math.abs(fa) < Math.abs(fb) ? done(a, fa) : done(b, fb);
    }
    // Secant along the ray: how fast |f| falls per metre walked (≤ 0 = not falling: safe step).
    const fall = (Math.abs(v) - Math.abs(v1)) / Math.abs(s1 - s);
    const safe = Math.abs(v1) / lipschitz;
    step = fall > 0 ? Math.min(Math.max(Math.abs(v1) / fall, safe), 4 * Math.abs(v1)) : safe;
    s = s1;
    v = v1;
  }
  return null;
}

export function bakeHeight(field: DistanceField, low: Mesh, o: HeightBakeOptions): HeightBake {
  const S = o.size;
  if (!(Number.isInteger(dmath.log2(S)) && S >= 16 && S <= 4096))
    throw new Ts23dError('T3D_BAKE_INVALID', {
      cause: `bake size ${S} is not a power of two in 16…4096`,
      fix: 'use 1024, 2048 or 4096',
    });
  if (!(Number.isFinite(o.cell) && o.cell > 0))
    throw new Ts23dError('T3D_BAKE_INVALID', {
      cause: `bake cell is ${o.cell} m`,
      fix: 'pass the finest detail to keep in metres, e.g. cell: 0.0015',
    });
  if (!low.uvs.length)
    throw new Ts23dError('T3D_BAKE_INVALID', {
      cause: 'the low mesh has no UVs',
      fix: 'bake onto a mesh with a unique UV layout (finish/atlas buildAtlas)',
    });
  const h = o.cell;
  const cage = o.cage ?? 8 * h;
  const L = o.lipschitz ?? 1.25;
  const reach = o.aoReach ?? 12 * h;
  const normal = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) normal.set([128, 128, 255, 255], i * 4);
  const height = new Float32Array(S * S);
  const curvature = new Float32Array(S * S);
  const ao = new Float32Array(S * S).fill(1);
  const hit = new Uint8Array(S * S);
  const color = o.color ? new Float32Array(S * S * 3).fill(-1) : undefined;
  const q: [number, number, number] = [0, 0, 0];
  const g = new Float64Array(3);
  const res = { v: 0 };
  let covered = 0;
  let hits = 0;
  const only = o.tris ?? Number.POSITIVE_INFINITY;
  const cov = walkTexels(low, S, o.tangents ?? uvTangents(low), (fr) => {
    if (fr.tri >= only) return;
    covered++;
    const p: Vec3 = [fr.p[0] ?? 0, fr.p[1] ?? 0, fr.p[2] ?? 0];
    const n: Vec3 = [fr.n[0] ?? 0, fr.n[1] ?? 0, fr.n[2] ?? 1];
    const s = fieldHit(field, p, n, cage, L, 1e-5, res);
    if (s === null) return;
    hits++;
    hit[fr.i] = 1;
    height[fr.i] = s;
    const c: Vec3 = [p[0] + n[0] * s, p[1] + n[1] * s, p[2] + n[2] * s];
    if (color && o.color) color.set(o.color(c), fr.i * 3);
    g.fill(0);
    let sum = -4 * res.v;
    for (const k of K) {
      q[0] = c[0] + k[0] * h;
      q[1] = c[1] + k[1] * h;
      q[2] = c[2] + k[2] * h;
      const v = field(q);
      sum += v;
      g[0] = (g[0] ?? 0) + k[0] * v;
      g[1] = (g[1] ?? 0) + k[1] * v;
      g[2] = (g[2] ?? 0) + k[2] * v;
    }
    // Σ f(c + h·k) − 4 f(c) = 2h²∇²f; mean curvature H = ½∇²f.
    curvature[fr.i] = sum / (4 * h * h);
    const gl = dmath.hypot(g[0] ?? 0, g[1] ?? 0, g[2] ?? 0);
    const m: Vec3 = gl > 1e-12 ? [(g[0] ?? 0) / gl, (g[1] ?? 0) / gl, (g[2] ?? 0) / gl] : n;
    const dot = (v: Float64Array): number =>
      (v[0] ?? 0) * m[0] + (v[1] ?? 0) * m[1] + (v[2] ?? 0) * m[2];
    const ts = [dot(fr.t), dot(fr.b), dot(fr.n)];
    for (let k = 0; k < 3; k++) normal[fr.i * 4 + k] = Math.round(((ts[k] ?? 0) * 0.5 + 0.5) * 255);
    if (reach > 0) {
      let occ = 0;
      for (let j = 1; j <= 4; j++) {
        const d = (reach * j) / 4;
        q[0] = c[0] + m[0] * d;
        q[1] = c[1] + m[1] * d;
        q[2] = c[2] + m[2] * d;
        occ += Math.max(0, d - field(q)) / d / dmath.pow(2, j);
      }
      ao[fr.i] = Math.max(0, Math.min(1, 1 - 1.6 * occ));
    }
  });
  return {
    size: S,
    normal,
    height,
    curvature,
    ao,
    ...(color ? { color } : {}),
    covered: cov,
    hit,
    hitRate: covered ? hits / covered : 0,
    cage,
  };
}
