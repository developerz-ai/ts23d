// A triangle BVH over a mesh for the two queries a mesh → field conversion needs: the closest
// point (unsigned distance, branch-and-bound on node boxes) and the generalised winding number
// (Jacobson et al. 2013; Barill et al. 2018 "fast winding numbers"): exact solid angles
// (Van Oosterom–Strackee) near the query, each far node's triangles as one dipole (area-weighted
// normal at its area centroid) beyond β = 2 node radii. w ≈ 1 inside, 0 outside, and degrades
// gracefully over holes and flipped patches where ray parity fails. Median split, leaves ≤ 4.

import type { Mesh, Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import { invalid } from './check.ts';
import { pointTriangle, solidAngle } from './triangle-queries.ts';

export { pointTriangle } from './triangle-queries.ts';

export interface TriBvh {
  readonly triangles: number;
  /** Unsigned distance from p to the mesh (searches no farther than `max`; returns `max` then). */
  distance(p: Vec3, max?: number): number;
  /** Closest surface point to p (`out` receives it); returns the distance. */
  closest(p: Vec3, out: [number, number, number]): number;
  /** Index (into mesh.indices / 3) of the triangle holding the closest point; −1 for none. */
  nearestTriangle(p: Vec3): number;
  /** Generalised winding number at p: ≈ 1 inside a closed outward-wound mesh, ≈ 0 outside. */
  winding(p: Vec3): number;
}

const LEAF = 4;
const BETA = 2;
const FOUR_PI = 4 * Math.PI;

/** Quickselect: order[k] is the k-th smallest of order[lo..hi] by `cmp`, smaller ones before it. */
function select(
  order: number[],
  lo: number,
  hi: number,
  k: number,
  cmp: (a: number, b: number) => number,
): void {
  let [l, h] = [lo, hi];
  while (l < h) {
    const pivot = order[(l + h) >> 1] ?? 0;
    let [i, j] = [l, h];
    while (i <= j) {
      while (cmp(order[i] ?? 0, pivot) < 0) i++;
      while (cmp(order[j] ?? 0, pivot) > 0) j--;
      if (i <= j) {
        [order[i], order[j]] = [order[j] ?? 0, order[i] ?? 0];
        i++;
        j--;
      }
    }
    if (k <= j) h = j;
    else if (k >= i) l = i;
    else return;
  }
}

export function triBvh(mesh: Mesh): TriBvh {
  const n = mesh.indices.length / 3;
  if (!(n >= 1)) invalid('mesh field: the mesh has no triangles', 'pass a triangle mesh');
  const P = mesh.positions;
  const tri = new Float64Array(n * 9);
  for (let i = 0; i < n * 3; i++) {
    const v = (mesh.indices[i] ?? 0) * 3;
    tri[i * 3] = P[v] ?? 0;
    tri[i * 3 + 1] = P[v + 1] ?? 0;
    tri[i * 3 + 2] = P[v + 2] ?? 0;
  }
  const order = Array.from({ length: n }, (_, i) => i);
  const C = new Float64Array(n * 3);
  for (let i = 0; i < n; i++)
    for (let a = 0; a < 3; a++)
      C[i * 3 + a] =
        ((tri[i * 9 + a] ?? 0) + (tri[i * 9 + 3 + a] ?? 0) + (tri[i * 9 + 6 + a] ?? 0)) / 3;
  const cen = (i: number, a: number): number => C[i * 3 + a] ?? 0;
  // Node arrays: box (6), dipole (normal·area 3, centroid 3, radius), children or leaf range.
  // Per triangle: area-weighted normal (½ e1 × e2) and area, for the dipoles.
  const AN = new Float64Array(n * 3);
  const AR = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 9;
    const [x1, y1, z1] = [0, 1, 2].map(
      (a) => (tri[o + 3 + a] ?? 0) - (tri[o + a] ?? 0),
    ) as unknown as Vec3;
    const [x2, y2, z2] = [0, 1, 2].map(
      (a) => (tri[o + 6 + a] ?? 0) - (tri[o + a] ?? 0),
    ) as unknown as Vec3;
    AN[i * 3] = (y1 * z2 - z1 * y2) / 2;
    AN[i * 3 + 1] = (z1 * x2 - x1 * z2) / 2;
    AN[i * 3 + 2] = (x1 * y2 - y1 * x2) / 2;
    AR[i] = dmath.hypot(AN[i * 3] ?? 0, AN[i * 3 + 1] ?? 0, AN[i * 3 + 2] ?? 0);
  }
  // Node arrays: box (6), dipole (normal·area 3, centroid 3, radius, area), children or leaf range.
  const box: number[] = [];
  const dip: number[] = [];
  const kid: number[] = [];
  const leaf = (id: number, lo: number, hi: number): void => {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    const d = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let k = lo; k < hi; k++) {
      const t = order[k] ?? 0;
      for (let v = 0; v < 9; v += 3)
        for (let a = 0; a < 3; a++) {
          b[a] = Math.min(b[a] ?? 0, tri[t * 9 + v + a] ?? 0);
          b[a + 3] = Math.max(b[a + 3] ?? 0, tri[t * 9 + v + a] ?? 0);
        }
      const ar = AR[t] ?? 0;
      for (let a = 0; a < 3; a++) {
        d[a] = (d[a] ?? 0) + (AN[t * 3 + a] ?? 0);
        d[a + 3] = (d[a + 3] ?? 0) + ar * cen(t, a);
      }
      d[7] = (d[7] ?? 0) + ar;
    }
    const area = d[7] ?? 0;
    for (let a = 0; a < 3; a++)
      d[a + 3] = area > 0 ? (d[a + 3] ?? 0) / area : ((b[a] ?? 0) + (b[a + 3] ?? 0)) / 2;
    let r = 0;
    for (let k = lo; k < hi; k++) {
      const o = (order[k] ?? 0) * 9;
      for (let v = 0; v < 9; v += 3)
        r = Math.max(
          r,
          dmath.hypot(
            (tri[o + v] ?? 0) - (d[3] ?? 0),
            (tri[o + v + 1] ?? 0) - (d[4] ?? 0),
            (tri[o + v + 2] ?? 0) - (d[5] ?? 0),
          ),
        );
    }
    d[6] = r;
    for (let a = 0; a < 6; a++) box[id * 6 + a] = b[a] ?? 0;
    for (let a = 0; a < 8; a++) dip[id * 8 + a] = d[a] ?? 0;
  };
  /** An inner node from its children: box union, dipole sum, radius bounding both spheres. */
  const join = (id: number, l: number, h: number): void => {
    for (let a = 0; a < 3; a++) {
      box[id * 6 + a] = Math.min(box[l * 6 + a] ?? 0, box[h * 6 + a] ?? 0);
      box[id * 6 + a + 3] = Math.max(box[l * 6 + a + 3] ?? 0, box[h * 6 + a + 3] ?? 0);
    }
    const al = dip[l * 8 + 7] ?? 0;
    const ah = dip[h * 8 + 7] ?? 0;
    const area = al + ah;
    const c = [0, 1, 2].map((a) =>
      area > 0
        ? ((dip[l * 8 + 3 + a] ?? 0) * al + (dip[h * 8 + 3 + a] ?? 0) * ah) / area
        : ((box[id * 6 + a] ?? 0) + (box[id * 6 + a + 3] ?? 0)) / 2,
    );
    const reach = (k: number): number =>
      dmath.hypot(
        (dip[k * 8 + 3] ?? 0) - (c[0] ?? 0),
        (dip[k * 8 + 4] ?? 0) - (c[1] ?? 0),
        (dip[k * 8 + 5] ?? 0) - (c[2] ?? 0),
      ) + (dip[k * 8 + 6] ?? 0);
    for (let a = 0; a < 3; a++) {
      dip[id * 8 + a] = (dip[l * 8 + a] ?? 0) + (dip[h * 8 + a] ?? 0);
      dip[id * 8 + 3 + a] = c[a] ?? 0;
    }
    dip[id * 8 + 6] = Math.max(reach(l), reach(h));
    dip[id * 8 + 7] = area;
  };
  const build = (lo: number, hi: number): number => {
    const id = kid.length / 2;
    kid.push(0, 0);
    if (hi - lo <= LEAF) {
      kid[id * 2] = -1 - lo;
      kid[id * 2 + 1] = hi;
      leaf(id, lo, hi);
      return id;
    }
    const cb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let k = lo; k < hi; k++)
      for (let a = 0; a < 3; a++) {
        const x = cen(order[k] ?? 0, a);
        cb[a] = Math.min(cb[a] ?? 0, x);
        cb[a + 3] = Math.max(cb[a + 3] ?? 0, x);
      }
    const ext = [0, 1, 2].map((a) => (cb[a + 3] ?? 0) - (cb[a] ?? 0));
    const axis = ext.indexOf(Math.max(...ext));
    const mid = (lo + hi) >> 1;
    select(order, lo, hi - 1, mid, (i, j) => cen(i, axis) - cen(j, axis) || i - j);
    const l = build(lo, mid);
    const h = build(mid, hi);
    kid[id * 2] = l;
    kid[id * 2 + 1] = h;
    join(id, l, h);
    return id;
  };
  build(0, n);
  const B = Float64Array.from(box);
  const D = Float64Array.from(dip);
  const K = Int32Array.from(kid);
  const O = Int32Array.from(order);
  const boxD2 = (id: number, x: number, y: number, z: number): number => {
    const o = id * 6;
    const dx = Math.max((B[o] ?? 0) - x, 0, x - (B[o + 3] ?? 0));
    const dy = Math.max((B[o + 1] ?? 0) - y, 0, y - (B[o + 4] ?? 0));
    const dz = Math.max((B[o + 2] ?? 0) - z, 0, z - (B[o + 5] ?? 0));
    return dx * dx + dy * dy + dz * dz;
  };
  const stack = new Int32Array(256);
  const q = [0, 0, 0];
  let bestTri = -1;
  const search = (p: Vec3, max: number, out: number[] | null): number => {
    let best = max * max;
    bestTri = -1;
    let sp = 0;
    stack[sp++] = 0;
    while (sp > 0) {
      const id = stack[--sp] ?? 0;
      if (boxD2(id, p[0], p[1], p[2]) >= best) continue;
      const a = K[id * 2] ?? 0;
      const b = K[id * 2 + 1] ?? 0;
      if (a < 0) {
        for (let k = -1 - a; k < b; k++) {
          const d2 = pointTriangle(p[0], p[1], p[2], tri, (O[k] ?? 0) * 9, q);
          if (d2 < best) {
            best = d2;
            bestTri = O[k] ?? -1;
            if (out) [out[0], out[1], out[2]] = [q[0] ?? 0, q[1] ?? 0, q[2] ?? 0];
          }
        }
        continue;
      }
      // Nearer child last, so it is searched first.
      const [near, far] =
        boxD2(a, p[0], p[1], p[2]) <= boxD2(b, p[0], p[1], p[2]) ? [a, b] : [b, a];
      stack[sp++] = far;
      stack[sp++] = near;
    }
    return Math.sqrt(best);
  };
  const winding = (p: Vec3): number => {
    let w = 0;
    let sp = 0;
    stack[sp++] = 0;
    while (sp > 0) {
      const id = stack[--sp] ?? 0;
      const o = id * 8;
      const dx = (D[o + 3] ?? 0) - p[0];
      const dy = (D[o + 4] ?? 0) - p[1];
      const dz = (D[o + 5] ?? 0) - p[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > BETA * (D[o + 6] ?? 0)) {
        w +=
          ((D[o] ?? 0) * dx + (D[o + 1] ?? 0) * dy + (D[o + 2] ?? 0) * dz) /
          (FOUR_PI * (dist * dist * dist));
        continue;
      }
      const a = K[id * 2] ?? 0;
      const b = K[id * 2 + 1] ?? 0;
      if (a < 0)
        for (let k = -1 - a; k < b; k++) w += solidAngle(p[0], p[1], p[2], tri, (O[k] ?? 0) * 9);
      else {
        stack[sp++] = a;
        stack[sp++] = b;
      }
    }
    return w;
  };
  return {
    triangles: n,
    distance: (p, max = Infinity) => search(p, max, null),
    closest: (p, out) => search(p, Infinity, out),
    nearestTriangle: (p) => {
      search(p, Infinity, null);
      return bestTri;
    },
    winding,
  };
}
