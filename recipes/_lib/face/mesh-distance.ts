// Distances from grid nodes to a triangle mesh for mesh-exact.ts: the exact closest point on one
// triangle (Ericson, Real-Time Collision Detection 5.1.5) and its propagation from the band of
// nodes round the surface to the whole grid — each node takes the nearest of its neighbours'
// closest triangles, re-queued while it improves — so every node holds a near-Euclidean
// distance (exact for the triangle it settles on), not a chamfer step count.

import type { Mesh } from '@developerz.ai/ts23d';

/** Barycentric weights of the closest point, written by `closest` (no allocation per call). */
export const W = new Float64Array(3);

/** Closest point on triangle abc to p (Ericson, Real-Time Collision Detection 5.1.5), as
 *  barycentric weights in W. Coordinates are passed as scalars: this runs millions of times. */
export function closest(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
): void {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  W[0] = 1;
  W[1] = 0;
  W[2] = 0;
  if (d1 <= 0 && d2 <= 0) return;
  const bpx = px - bx;
  const bpy = py - by;
  const bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) {
    W[0] = 0;
    W[1] = 1;
    return;
  }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    W[0] = 1 - v;
    W[1] = v;
    return;
  }
  const cpx = px - cx;
  const cpy = py - cy;
  const cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) {
    W[0] = 0;
    W[2] = 1;
    return;
  }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    W[0] = 1 - w;
    W[2] = w;
    return;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    W[0] = 0;
    W[1] = 1 - w;
    W[2] = w;
    return;
  }
  const den = 1 / (va + vb + vc);
  W[1] = vb * den;
  W[2] = vc * den;
  W[0] = 1 - W[1] - W[2];
}

/** Distance from (px, py, pz) to triangle t of the mesh. */
export function distTo(
  P: Mesh['positions'],
  T: Mesh['indices'],
  t: number,
  px: number,
  py: number,
  pz: number,
): number {
  const ia = (T[t] ?? 0) * 3;
  const ib = (T[t + 1] ?? 0) * 3;
  const ic = (T[t + 2] ?? 0) * 3;
  closest(
    px,
    py,
    pz,
    P[ia] ?? 0,
    P[ia + 1] ?? 0,
    P[ia + 2] ?? 0,
    P[ib] ?? 0,
    P[ib + 1] ?? 0,
    P[ib + 2] ?? 0,
    P[ic] ?? 0,
    P[ic + 1] ?? 0,
    P[ic + 2] ?? 0,
  );
  const u = W[0] ?? 0;
  const v = W[1] ?? 0;
  const w = W[2] ?? 0;
  const dx = px - (u * (P[ia] ?? 0) + v * (P[ib] ?? 0) + w * (P[ic] ?? 0));
  const dy = py - (u * (P[ia + 1] ?? 0) + v * (P[ib + 1] ?? 0) + w * (P[ic + 1] ?? 0));
  const dz = pz - (u * (P[ia + 2] ?? 0) + v * (P[ib + 2] ?? 0) + w * (P[ic + 2] ?? 0));
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Fills every node of `val` (unsigned distances, +Infinity off the band) within `cutoff` metres of
 * the mesh with the distance to the nearest triangle among its neighbours' (`tri`: the closest
 * triangle per node, -1 off the band), nearest first (a bucket queue, each node settled once);
 * nodes farther than `cutoff` get `cutoff`, a lower bound.
 */
export function propagate(
  val: Float32Array,
  tri: Int32Array,
  g: {
    readonly origin: readonly [number, number, number];
    readonly cell: number;
    readonly n: readonly [number, number, number];
  },
  P: Mesh['positions'],
  T: Mesh['indices'],
  cutoff: number,
): void {
  const [nx, ny, nz] = g.n;
  const [ox, oy, oz] = g.origin;
  const h = g.cell;
  const size = nx * ny * nz;
  const step = h * 0.25;
  const buckets: number[][] = Array.from({ length: Math.ceil(cutoff / step) + 1 }, () => []);
  const done = new Uint8Array(size);
  const push = (at: number, d: number): void => {
    if (d < cutoff) buckets[Math.floor(d / step)]?.push(at);
  };
  for (let at = 0; at < size; at++) if ((tri[at] ?? -1) >= 0) push(at, val[at] ?? 0);
  for (const bucket of buckets)
    for (let q = 0; q < bucket.length; q++) {
      const at = bucket[q] ?? 0;
      if (done[at]) continue;
      done[at] = 1;
      const t = tri[at] ?? -1;
      const i = at % nx;
      const j = Math.floor(at / nx) % ny;
      const k = Math.floor(at / (nx * ny));
      const visit = (b: number, bi: number, bj: number, bk: number): void => {
        if (done[b]) return;
        const d = distTo(P, T, t, ox + bi * h, oy + bj * h, oz + bk * h);
        if (d < (val[b] ?? Infinity) - 1e-9) {
          val[b] = d;
          tri[b] = t;
          push(b, d);
        }
      };
      if (i > 0) visit(at - 1, i - 1, j, k);
      if (i < nx - 1) visit(at + 1, i + 1, j, k);
      if (j > 0) visit(at - nx, i, j - 1, k);
      if (j < ny - 1) visit(at + nx, i, j + 1, k);
      if (k > 0) visit(at - nx * ny, i, j, k - 1);
      if (k < nz - 1) visit(at + nx * ny, i, j, k + 1);
    }
  for (let at = 0; at < size; at++) if (!((val[at] ?? Infinity) < cutoff)) val[at] = cutoff;
}

/**
 * Unsigned distance and closest triangle for every node within `reach` of the triangles listed in
 * `tris` (first-index offsets into `T`); other nodes stay +Infinity / -1.
 */
export function band(
  P: Mesh['positions'],
  T: Mesh['indices'],
  tris: Int32Array,
  g: {
    readonly origin: readonly [number, number, number];
    readonly cell: number;
    readonly n: readonly [number, number, number];
  },
  reach: number,
): { val: Float32Array; tri: Int32Array } {
  const [nx, ny, nz] = g.n;
  const [ox, oy, oz] = g.origin;
  const h = g.cell;
  const val = new Float32Array(nx * ny * nz).fill(Number.POSITIVE_INFINITY);
  const tri = new Int32Array(nx * ny * nz).fill(-1);
  for (const t of tris) {
    let lo0 = Infinity;
    let lo1 = Infinity;
    let lo2 = Infinity;
    let hi0 = -Infinity;
    let hi1 = -Infinity;
    let hi2 = -Infinity;
    for (let e = 0; e < 3; e++) {
      const v = (T[t + e] ?? 0) * 3;
      lo0 = Math.min(lo0, P[v] ?? 0);
      lo1 = Math.min(lo1, P[v + 1] ?? 0);
      lo2 = Math.min(lo2, P[v + 2] ?? 0);
      hi0 = Math.max(hi0, P[v] ?? 0);
      hi1 = Math.max(hi1, P[v + 1] ?? 0);
      hi2 = Math.max(hi2, P[v + 2] ?? 0);
    }
    const i0 = Math.max(0, Math.floor((lo0 - reach - ox) / h));
    const j0 = Math.max(0, Math.floor((lo1 - reach - oy) / h));
    const k0 = Math.max(0, Math.floor((lo2 - reach - oz) / h));
    const i1 = Math.min(nx - 1, Math.ceil((hi0 + reach - ox) / h));
    const j1 = Math.min(ny - 1, Math.ceil((hi1 + reach - oy) / h));
    const k1 = Math.min(nz - 1, Math.ceil((hi2 + reach - oz) / h));
    for (let k = k0; k <= k1; k++)
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const d = distTo(P, T, t, ox + i * h, oy + j * h, oz + k * h);
          const at = (k * ny + j) * nx + i;
          if (d <= reach && d < (val[at] ?? Infinity)) {
            val[at] = d;
            tri[at] = t;
          }
        }
  }
  return { val, tri };
}
