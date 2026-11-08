// A triangle mesh as a signed distance field, so SDF tools can work on the warped face: the hair
// and beard masses sculpt against the scalp, and LOD2 re-meshes the skin at a coarse cell like
// the sculpted busts do. Exact distance (closest point on the nearest triangle, signed by the
// interpolated vertex normal) in a band of grid nodes round the surface; beyond it ±band, with
// the sign from a flood fill of the outside. Trilinear between nodes. Deterministic.

import type { Field, Mesh, Vec3 } from '@developerz.ai/ts23d';

export interface MeshField {
  readonly field: Field;
  /** Colour of the surface nearest `p` (vertex colours of the closest triangle). */
  readonly colorAt: (p: Vec3) => Vec3;
  readonly bounds: readonly [Vec3, Vec3];
}

/** Barycentric weights of the closest point, written by `closest` (no allocation per call). */
const W = new Float64Array(3);

/** Closest point on triangle abc to p (Ericson, Real-Time Collision Detection 5.1.5), as
 *  barycentric weights in W. Coordinates are passed as scalars: this runs millions of times. */
function closest(
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

export function meshField(m: Mesh, cell: number, band = 3): MeshField {
  const P = m.positions;
  const N = m.normals;
  const T = m.indices;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i++) {
    lo[i % 3] = Math.min(lo[i % 3] ?? 0, P[i] ?? 0);
    hi[i % 3] = Math.max(hi[i % 3] ?? 0, P[i] ?? 0);
  }
  const pad = (band + 2) * cell;
  const [ox = 0, oy = 0, oz = 0] = lo.map((v) => v - pad);
  const o = [ox, oy, oz];
  const n = hi.map((v, k) => Math.ceil((v + pad - (o[k] ?? 0)) / cell) + 1);
  const [nx = 1, ny = 1, nz = 1] = n;
  const idx = (i: number, j: number, k: number): number => (k * ny + j) * nx + i;
  const reach = band * cell;
  const val = new Float32Array(nx * ny * nz).fill(Number.POSITIVE_INFINITY);
  const tri = new Int32Array(nx * ny * nz).fill(-1);
  for (let t = 0; t < T.length; t += 3) {
    const ia = (T[t] ?? 0) * 3;
    const ib = (T[t + 1] ?? 0) * 3;
    const ic = (T[t + 2] ?? 0) * 3;
    const ax = P[ia] ?? 0;
    const ay = P[ia + 1] ?? 0;
    const az = P[ia + 2] ?? 0;
    const bx = P[ib] ?? 0;
    const by = P[ib + 1] ?? 0;
    const bz = P[ib + 2] ?? 0;
    const cx = P[ic] ?? 0;
    const cy = P[ic + 1] ?? 0;
    const cz = P[ic + 2] ?? 0;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - reach - ox) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - reach - oy) / cell));
    const k0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - reach - oz) / cell));
    const i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) + reach - ox) / cell));
    const j1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by, cy) + reach - oy) / cell));
    const k1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz, cz) + reach - oz) / cell));
    for (let k = k0; k <= k1; k++)
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const px = ox + i * cell;
          const py = oy + j * cell;
          const pz = oz + k * cell;
          closest(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz);
          const u = W[0] ?? 0;
          const v = W[1] ?? 0;
          const w = W[2] ?? 0;
          const dx = px - (u * ax + v * bx + w * cx);
          const dy = py - (u * ay + v * by + w * cy);
          const dz = pz - (u * az + v * bz + w * cz);
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const at = idx(i, j, k);
          if (d > reach || d >= Math.abs(val[at] ?? Infinity)) continue;
          const sx = u * (N[ia] ?? 0) + v * (N[ib] ?? 0) + w * (N[ic] ?? 0);
          const sy = u * (N[ia + 1] ?? 0) + v * (N[ib + 1] ?? 0) + w * (N[ic + 1] ?? 0);
          const sz = u * (N[ia + 2] ?? 0) + v * (N[ib + 2] ?? 0) + w * (N[ic + 2] ?? 0);
          val[at] = dx * sx + dy * sy + dz * sz < 0 ? -d : d;
          tri[at] = t;
        }
  }
  // Outside by flood fill from the grid's boundary through nodes off the band; the rest inside.
  const outside = new Uint8Array(nx * ny * nz);
  const stack: number[] = [];
  const seed = (at: number): void => {
    if (outside[at] || Number.isFinite(val[at] ?? 0)) return;
    outside[at] = 1;
    stack.push(at);
  };
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++)
        if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1)
          seed(idx(i, j, k));
  while (stack.length > 0) {
    const at = stack.pop() ?? 0;
    const i = at % nx;
    const j = Math.floor(at / nx) % ny;
    const k = Math.floor(at / (nx * ny));
    if (i > 0) seed(at - 1);
    if (i < nx - 1) seed(at + 1);
    if (j > 0) seed(at - nx);
    if (j < ny - 1) seed(at + nx);
    if (k > 0) seed(at - nx * ny);
    if (k < nz - 1) seed(at + nx * ny);
  }
  // Off the band: breadth-first steps from the band give a distance that keeps growing (a
  // chamfer bound), so offsets thicker than the band still see "outside" far from the skin.
  const queue = new Int32Array(val.length);
  let head = 0;
  let tail = 0;
  const steps = new Int32Array(val.length).fill(-1);
  for (let at = 0; at < val.length; at++)
    if (Number.isFinite(val[at] ?? 0)) {
      steps[at] = 0;
      queue[tail++] = at;
    }
  while (head < tail) {
    const at = queue[head++] ?? 0;
    const i = at % nx;
    const j = Math.floor(at / nx) % ny;
    const k = Math.floor(at / (nx * ny));
    const next = (b: number): void => {
      if ((steps[b] ?? 0) >= 0) return;
      steps[b] = (steps[at] ?? 0) + 1;
      queue[tail++] = b;
    };
    if (i > 0) next(at - 1);
    if (i < nx - 1) next(at + 1);
    if (j > 0) next(at - nx);
    if (j < ny - 1) next(at + nx);
    if (k > 0) next(at - nx * ny);
    if (k < nz - 1) next(at + nx * ny);
  }
  for (let at = 0; at < val.length; at++)
    if (!Number.isFinite(val[at] ?? 0)) {
      const d = reach + Math.max(0, (steps[at] ?? 0) - 1) * cell * 0.7;
      val[at] = outside[at] ? d : -d;
    }
  const field: Field = (p) => {
    const fx = (p[0] - (o[0] ?? 0)) / cell;
    const fy = (p[1] - (o[1] ?? 0)) / cell;
    const fz = (p[2] - (o[2] ?? 0)) / cell;
    if (fx < 0 || fy < 0 || fz < 0 || fx >= nx - 1 || fy >= ny - 1 || fz >= nz - 1) {
      // Beyond the grid: the band reach plus the distance to the grid box.
      const ox2 = Math.max(0, -fx, fx - (nx - 1));
      const oy2 = Math.max(0, -fy, fy - (ny - 1));
      const oz2 = Math.max(0, -fz, fz - (nz - 1));
      return reach + (band + 2) * cell * 0.7 + Math.hypot(ox2, oy2, oz2) * cell;
    }
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const k = Math.floor(fz);
    const tx = fx - i;
    const ty = fy - j;
    const tz = fz - k;
    const g = (a: number, b: number, c: number): number => val[idx(i + a, j + b, k + c)] ?? 0;
    const x00 = g(0, 0, 0) + (g(1, 0, 0) - g(0, 0, 0)) * tx;
    const x10 = g(0, 1, 0) + (g(1, 1, 0) - g(0, 1, 0)) * tx;
    const x01 = g(0, 0, 1) + (g(1, 0, 1) - g(0, 0, 1)) * tx;
    const x11 = g(0, 1, 1) + (g(1, 1, 1) - g(0, 1, 1)) * tx;
    const y0 = x00 + (x10 - x00) * ty;
    const y1 = x01 + (x11 - x01) * ty;
    return y0 + (y1 - y0) * tz;
  };
  const C = m.colors;
  const colorAt = (p: Vec3): Vec3 => {
    const i = Math.round((p[0] - (o[0] ?? 0)) / cell);
    const j = Math.round((p[1] - (o[1] ?? 0)) / cell);
    const k = Math.round((p[2] - (o[2] ?? 0)) / cell);
    const t =
      i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz ? (tri[idx(i, j, k)] ?? -1) : -1;
    if (t < 0) return [C[0] ?? 0.5, C[1] ?? 0.5, C[2] ?? 0.5];
    const out: [number, number, number] = [0, 0, 0];
    for (let e = 0; e < 3; e++) {
      const v = T[t + e] ?? 0;
      for (let d = 0; d < 3; d++) out[d] = (out[d] ?? 0) + (C[v * 3 + d] ?? 0) / 3;
    }
    return out;
  };
  return {
    field,
    colorAt,
    bounds: [
      [lo[0] ?? 0, lo[1] ?? 0, lo[2] ?? 0],
      [hi[0] ?? 0, hi[1] ?? 0, hi[2] ?? 0],
    ],
  };
}
