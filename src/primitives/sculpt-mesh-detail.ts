// The hybrid surface: a model mesh's brick (sculpt-mesh-field.ts) as a relief over the code
// sculpt. Only the high-pass reaches the surface — the brick minus its Gaussian blur at `sigma`,
// so the model's skin (fur clumps, folds, the lumps of a coat) passes while its shape (stumpy
// legs, a mushy face, a missing tail) does not — soft-clamped to ±amp, and faded to nothing where
// the model's surface strays more than `reach` from the point (the model is wrong there; code
// owns the anatomy). A relief is an outward offset at a surface point: d' = d − at(p).

import type { Mesh, Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import { invalid } from './check.ts';
import { type MeshBrick, trilinear } from './sculpt-mesh-field.ts';

export interface MeshDetailOptions {
  /** Largest outward/inward push, metres (soft clamp). */
  readonly amp: number;
  /** Gaussian sigma of the low-pass, metres: shapes broader than ~2σ are the code's. */
  readonly sigma: number;
  /** Gaussian sigma of a pre-smoothing (band-pass), metres: removes the facet creases of a
   *  decimated model mesh (QA connections reads them as seams). Default none. */
  readonly fine?: number;
  /** Gain on the high-pass before the clamp (default 1). */
  readonly strength?: number;
  /** Fade the detail out where the model surface is farther than this (default band / 2). */
  readonly reach?: number;
}

export interface MeshDetail {
  readonly amp: number;
  /** Outward offset at surface point p, |value| < amp. */
  readonly at: (p: Vec3) => number;
}

const blurMemo = new WeakMap<MeshBrick, Map<number, Float32Array>>();

/** Separable Gaussian blur of the brick (dequantised), truncated at 2.5σ, edges clamped. */
function blurred(b: MeshBrick, sigma: number): Float32Array {
  const seen = blurMemo.get(b)?.get(sigma);
  if (seen) return seen;
  const [nx, ny, nz] = b.dims;
  const k = b.band / 32767;
  let src = Float32Array.from(b.samples, (v) => v * k);
  const r = Math.max(1, Math.ceil((2.5 * sigma) / b.cell));
  const w = Array.from({ length: 2 * r + 1 }, (_, i) =>
    dmath.exp(-dmath.pow((i - r) * b.cell, 2) / (2 * sigma * sigma)),
  );
  const sum = w.reduce((s, x) => s + x, 0);
  const wn = w.map((x) => x / sum);
  const n = [nx, ny, nz];
  const strides = [1, nx, nx * ny];
  for (let a = 0; a < 3; a++) {
    const dst = new Float32Array(src.length);
    const st = strides[a] ?? 1;
    const len = n[a] ?? 1;
    for (let id = 0; id < src.length; id++) {
      const c = Math.floor(id / st) % len;
      let acc = 0;
      for (let t = -r; t <= r; t++) {
        const cc = Math.max(0, Math.min(len - 1, c + t));
        acc += (wn[t + r] ?? 0) * (src[id + (cc - c) * st] ?? 0);
      }
      dst[id] = acc;
    }
    src = dst;
  }
  blurMemo.set(b, (blurMemo.get(b) ?? new Map()).set(sigma, src));
  return src;
}

export function meshDetail(b: MeshBrick, o: MeshDetailOptions): MeshDetail {
  if (!(o.amp > 0 && Number.isFinite(o.amp)))
    invalid(`mesh detail: amp is ${o.amp}`, 'give the largest push in metres, e.g. 0.004');
  if (!(o.sigma >= b.cell))
    invalid(`mesh detail: sigma ${o.sigma} is under the brick cell ${b.cell}`, 'use sigma ≥ cell');
  const low = trilinear(blurred(b, o.sigma), b.dims, b.bounds[0], b.cell, b.band);
  const fine = o.fine ? trilinear(blurred(b, o.fine), b.dims, b.bounds[0], b.cell, b.band) : null;
  const gain = o.strength ?? 1;
  const reach = o.reach ?? b.band / 2;
  const amp = o.amp;
  return {
    amp,
    at: (p) => {
      const d = fine ? fine(p) : b.field(p);
      const fade = 1 - Math.min(1, Math.max(0, (Math.abs(d) - reach) / reach));
      if (fade <= 0) return 0;
      const hp = (low(p) - d) * gain;
      return amp * dmath.tanh(hp / amp) * fade * fade * (3 - 2 * fade);
    },
  };
}

export interface MeshOffsetOptions {
  /** Longest move, metres (soft clamp). */
  readonly amp: number;
  /** Pre-smoothing sigma of the model surface, metres (its facets are not shape). */
  readonly fine: number;
  /** No move where the model surface is farther than 2 × this; full move within it. */
  readonly reach: number;
}

/**
 * The vector that carries a point onto the model's (smoothed) surface: −d · ∇d / |∇d|, soft-
 * clamped to `amp` and faded out past `reach` (where the model is wrong, the code stays). Used
 * as one warp field for every part, so parts that touched still touch.
 */
export function meshOffset(b: MeshBrick, o: MeshOffsetOptions): (p: Vec3) => Vec3 {
  if (!(o.amp > 0 && o.reach > 0 && o.fine >= b.cell))
    invalid(
      `mesh offset: amp ${o.amp}, reach ${o.reach}, fine ${o.fine}`,
      'use amp, reach > 0 and fine ≥ cell',
    );
  const f = trilinear(blurred(b, o.fine), b.dims, b.bounds[0], b.cell, b.band);
  const h = b.cell * 0.5;
  return (p) => {
    const d = f(p);
    const a = Math.abs(d);
    if (a >= o.reach * 2) return [0, 0, 0];
    const gx = f([p[0] + h, p[1], p[2]]) - f([p[0] - h, p[1], p[2]]);
    const gy = f([p[0], p[1] + h, p[2]]) - f([p[0], p[1] - h, p[2]]);
    const gz = f([p[0], p[1], p[2] + h]) - f([p[0], p[1], p[2] - h]);
    const l = dmath.hypot(gx, gy, gz);
    if (!(l > 0)) return [0, 0, 0];
    const t = a <= o.reach ? 1 : 2 - a / o.reach;
    const fade = t * t * (3 - 2 * t);
    const m = -o.amp * dmath.tanh(d / o.amp) * fade;
    return [(gx / l) * m, (gy / l) * m, (gz / l) * m];
  };
}

/**
 * A meshed surface pushed along its normals by `at` (a relief: meshDetail, fur clumps) and,
 * optionally, recoloured; normals recomputed (warpMesh).
 */
export function displaceMesh(
  mesh: Mesh,
  at: (p: Vec3) => number,
  recolour?: (p: Vec3, c: Vec3) => Vec3,
): Mesh {
  const N = mesh.normals;
  return warpMesh(
    mesh,
    (p, v) => {
      const i = v * 3;
      const n: Vec3 = [N[i] ?? 0, N[i + 1] ?? 0, N[i + 2] ?? 0];
      const l = dmath.norm(n) || 1;
      const d = at(p);
      return [(n[0] / l) * d, (n[1] / l) * d, (n[2] / l) * d];
    },
    recolour,
  );
}

/**
 * A meshed surface moved by a vector field (`offset` per vertex) and optionally
 * recoloured; normals are recomputed (area-weighted, shared across vertices at the same position,
 * so mirror and detail seams stay smooth). For meshes already built (a kind's parts) that a
 * model's surface reshapes: every part warped by one field keeps touching its neighbours.
 */
export function warpMesh(
  mesh: Mesh,
  offset: (p: Vec3, vertex: number) => Vec3,
  recolour?: (p: Vec3, c: Vec3) => Vec3,
): Mesh {
  const P = mesh.positions;
  const N = mesh.normals;
  const C = mesh.colors;
  const pos = new Float32Array(P.length);
  const col = new Float32Array(C.length);
  for (let i = 0; i < P.length; i += 3) {
    const p: Vec3 = [P[i] ?? 0, P[i + 1] ?? 0, P[i + 2] ?? 0];
    const d = offset(p, i / 3);
    for (let a = 0; a < 3; a++) pos[i + a] = (p[a] ?? 0) + (d[a] ?? 0);
    const c: Vec3 = [C[i] ?? 0, C[i + 1] ?? 0, C[i + 2] ?? 0];
    const out = recolour ? recolour(p, c) : c;
    for (let a = 0; a < 3; a++) col[i + a] = Math.max(0, Math.min(1, out[a] ?? 0));
  }
  // Area-weighted face normals into shared-position buckets.
  const key = (i: number): string => `${P[i * 3]},${P[i * 3 + 1]},${P[i * 3 + 2]}`;
  const bucket = new Map<string, number>();
  const of = new Int32Array(P.length / 3);
  for (let v = 0; v < P.length / 3; v++) {
    const k = key(v);
    const b = bucket.get(k) ?? bucket.size;
    bucket.set(k, b);
    of[v] = b;
  }
  const acc = new Float64Array(bucket.size * 3);
  const I = mesh.indices;
  for (let t = 0; t < I.length; t += 3) {
    const [a, b, c] = [I[t] ?? 0, I[t + 1] ?? 0, I[t + 2] ?? 0];
    const e1 = [0, 1, 2].map((k) => (pos[b * 3 + k] ?? 0) - (pos[a * 3 + k] ?? 0));
    const e2 = [0, 1, 2].map((k) => (pos[c * 3 + k] ?? 0) - (pos[a * 3 + k] ?? 0));
    const n = [
      (e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0),
      (e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0),
      (e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0),
    ];
    for (const v of [a, b, c])
      for (let k = 0; k < 3; k++)
        acc[(of[v] ?? 0) * 3 + k] = (acc[(of[v] ?? 0) * 3 + k] ?? 0) + (n[k] ?? 0);
  }
  const normals = new Float32Array(P.length);
  for (let v = 0; v < P.length / 3; v++) {
    const b = (of[v] ?? 0) * 3;
    const l = dmath.hypot(acc[b] ?? 0, acc[b + 1] ?? 0, acc[b + 2] ?? 0);
    for (let k = 0; k < 3; k++)
      normals[v * 3 + k] = l > 0 ? (acc[b + k] ?? 0) / l : (N[v * 3 + k] ?? 0);
  }
  return { ...mesh, positions: pos, normals, colors: col };
}
