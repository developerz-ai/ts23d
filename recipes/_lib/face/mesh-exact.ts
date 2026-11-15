// A closed triangle mesh as an exact signed distance field (mesh-field.ts `inside: 'parity'`):
// signs from a three-axis ray-parity vote (mesh-inside.ts), optional plugs and closed voids filled
// (a sealed mouth's cavity), then distances to the OUTER skin only — triangles with inside on
// both faces (walls of a filled void) are dropped — computed in a band and
// propagated nearest-first over the whole grid (mesh-distance.ts). Beyond the grid: the value on
// its wall plus the way out, so the field stays continuous for smooth unions. Deterministic.

import type { Field, Mesh, Vec3 } from '@developerz.ai/ts23d';
import { band, propagate } from './mesh-distance.ts';
import { fillVoids, insideVotes } from './mesh-inside.ts';

export interface ExactOptions {
  /** Sample only inside this box (a fine field over part of a mesh; voids stay open). */
  readonly box?: readonly [Vec3, Vec3];
  /** Closed voids (and those sealed by slits under 2 cells, or by `plugs`) count as inside. */
  readonly fillVoids?: boolean;
  /** Ellipsoids counted inside before the voids fill (a plug behind a lip line seals it). */
  readonly plugs?: readonly { readonly at: Vec3; readonly r: Vec3 }[];
}

export function exactField(
  m: Mesh,
  cell: number,
  band0: number,
  o: ExactOptions,
): { field: Field; bounds: [Vec3, Vec3] } {
  const P = m.positions;
  const T = m.indices;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i++) {
    lo[i % 3] = Math.min(lo[i % 3] ?? 0, P[i] ?? 0);
    hi[i % 3] = Math.max(hi[i % 3] ?? 0, P[i] ?? 0);
  }
  for (let k = 0; k < 3 && o.box; k++) {
    lo[k] = Math.max(lo[k] ?? 0, o.box[0][k] ?? 0);
    hi[k] = Math.min(hi[k] ?? 0, o.box[1][k] ?? 0);
  }
  const pad = (band0 + 2) * cell;
  const origin: [number, number, number] = [
    (lo[0] ?? 0) - pad,
    (lo[1] ?? 0) - pad,
    (lo[2] ?? 0) - pad,
  ];
  const [nx, ny, nz] = [0, 1, 2].map(
    (k) => Math.ceil(((hi[k] ?? 0) + pad - (origin[k] ?? 0)) / cell) + 1,
  ) as [number, number, number];
  const g = { origin, cell, n: [nx, ny, nz] as [number, number, number] };
  const reach = band0 * cell;
  const all = new Int32Array(T.length / 3).map((_, i) => i * 3);
  const votes = insideVotes(m, g);
  for (const p of o.plugs ?? [])
    for (let at = 0; at < votes.length; at++) {
      const x = origin[0] + (at % nx) * cell - p.at[0];
      const y = origin[1] + (Math.floor(at / nx) % ny) * cell - p.at[1];
      const z = origin[2] + Math.floor(at / (nx * ny)) * cell - p.at[2];
      if ((x / p.r[0]) ** 2 + (y / p.r[1]) ** 2 + (z / p.r[2]) ** 2 <= 1) votes[at] = 1;
    }
  let tris = all;
  if (o.fillVoids && !o.box) {
    fillVoids(votes, g.n, band(P, T, all, g, reach).val, cell * 2);
    tris = all.filter((t) => separates(P, T, t, votes, g));
  }
  const { val, tri } = band(P, T, tris, g, reach);
  propagate(val, tri, g, P, T, Math.hypot(nx, ny, nz) * cell);
  for (let at = 0; at < val.length; at++) val[at] = votes[at] ? -(val[at] ?? 0) : (val[at] ?? 0);
  // One [1 2 1] pass per axis: trilinear kinks between nodes read as curvature noise in the
  // skin painter's cavity and ridge tones; the blur moves the surface by a fraction of a cell.
  for (let a = 0; a < 3; a++) blur(val, g.n, a);
  const idx = (i: number, j: number, k: number): number => (k * ny + j) * nx + i;
  const lerp3 = (fx: number, fy: number, fz: number): number => {
    const i = Math.min(nx - 2, Math.floor(fx));
    const j = Math.min(ny - 2, Math.floor(fy));
    const k = Math.min(nz - 2, Math.floor(fz));
    const tx = fx - i;
    const ty = fy - j;
    const tz = fz - k;
    const v = (a: number, b: number, c: number): number => val[idx(i + a, j + b, k + c)] ?? 0;
    const x00 = v(0, 0, 0) + (v(1, 0, 0) - v(0, 0, 0)) * tx;
    const x10 = v(0, 1, 0) + (v(1, 1, 0) - v(0, 1, 0)) * tx;
    const x01 = v(0, 0, 1) + (v(1, 0, 1) - v(0, 0, 1)) * tx;
    const x11 = v(0, 1, 1) + (v(1, 1, 1) - v(0, 1, 1)) * tx;
    const y0 = x00 + (x10 - x00) * ty;
    const y1 = x01 + (x11 - x01) * ty;
    return y0 + (y1 - y0) * tz;
  };
  const clamp = (f: number, n: number): number => Math.min(n - 1, Math.max(0, f));
  const field: Field = (p) => {
    const fx = (p[0] - origin[0]) / cell;
    const fy = (p[1] - origin[1]) / cell;
    const fz = (p[2] - origin[2]) / cell;
    const out = Math.hypot(
      Math.max(0, -fx, fx - (nx - 1)),
      Math.max(0, -fy, fy - (ny - 1)),
      Math.max(0, -fz, fz - (nz - 1)),
    );
    return lerp3(clamp(fx, nx), clamp(fy, ny), clamp(fz, nz)) + out * cell;
  };
  return {
    field,
    bounds: [
      [lo[0] ?? 0, lo[1] ?? 0, lo[2] ?? 0],
      [hi[0] ?? 0, hi[1] ?? 0, hi[2] ?? 0],
    ],
  };
}

/** Whether triangle `t` borders the outside: a node one or two cells off either face is outside
 *  (or off the grid). Only walls of a filled void have inside all round. */
function separates(
  P: Mesh['positions'],
  T: Mesh['indices'],
  t: number,
  votes: Uint8Array,
  g: {
    readonly origin: readonly [number, number, number];
    readonly cell: number;
    readonly n: readonly [number, number, number];
  },
): boolean {
  const a = (T[t] ?? 0) * 3;
  const b = (T[t + 1] ?? 0) * 3;
  const c = (T[t + 2] ?? 0) * 3;
  const e1 = [0, 1, 2].map((k) => (P[b + k] ?? 0) - (P[a + k] ?? 0));
  const e2 = [0, 1, 2].map((k) => (P[c + k] ?? 0) - (P[a + k] ?? 0));
  const nrm = [
    (e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0),
    (e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0),
    (e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0),
  ];
  const len = Math.hypot(nrm[0] ?? 0, nrm[1] ?? 0, nrm[2] ?? 0) || 1;
  const side = (s: number): number => {
    const ijk = [0, 1, 2].map((k) =>
      Math.round(
        ((P[a + k] ?? 0) + (P[b + k] ?? 0) + (P[c + k] ?? 0)) / 3 / g.cell +
          (s * (nrm[k] ?? 0)) / len -
          (g.origin[k] ?? 0) / g.cell,
      ),
    );
    if (ijk.some((v, k) => v < 0 || v >= (g.n[k] ?? 0))) return 0;
    return votes[((ijk[2] ?? 0) * g.n[1] + (ijk[1] ?? 0)) * g.n[0] + (ijk[0] ?? 0)] ?? 0;
  };
  return side(1) === 0 || side(-1) === 0 || side(2) === 0 || side(-2) === 0;
}

/** One [1 2 1] / 4 pass along axis `a` (the ends keep their value). */
function blur(val: Float32Array, n: readonly [number, number, number], a: number): void {
  const [nx, ny, nz] = n;
  const stride = a === 0 ? 1 : a === 1 ? nx : nx * ny;
  const len = n[a] ?? 1;
  const line = new Float32Array(len);
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const c = a === 0 ? i : a === 1 ? j : k;
        if (c !== 0) continue;
        const base = (k * ny + j) * nx + i;
        for (let t = 0; t < len; t++) line[t] = val[base + t * stride] ?? 0;
        for (let t = 1; t + 1 < len; t++)
          val[base + t * stride] =
            ((line[t - 1] ?? 0) + 2 * (line[t] ?? 0) + (line[t + 1] ?? 0)) / 4;
      }
}
