// Self-intersection count for deformation QA: triangle pairs of one surface that cross each other
// (an edge of one pierces the other), skipping pairs that share a corner (corners welded by
// position, so split normals and UV seams still count as neighbours). A uniform hash grid on the
// triangles' bounds keeps it near-linear on the few thousand triangles round a joint.

import { dmath } from '../core/index.ts';

type V = readonly [number, number, number];

const at = (P: ArrayLike<number>, i: number): V => [
  P[i * 3] ?? 0,
  P[i * 3 + 1] ?? 0,
  P[i * 3 + 2] ?? 0,
];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Does segment p → q cross triangle (a, b, c) strictly inside both? (Möller–Trumbore.) */
export function segmentHitsTriangle(p: V, q: V, a: V, b: V, c: V): boolean {
  const d = sub(q, p);
  const e1 = sub(b, a);
  const e2 = sub(c, a);
  const h = cross(d, e2);
  const det = dot(e1, h);
  if (Math.abs(det) < 1e-18) return false;
  const s = sub(p, a);
  const u = dot(s, h) / det;
  if (u <= 0 || u >= 1) return false;
  const qv = cross(s, e1);
  const v = dot(d, qv) / det;
  if (v <= 0 || u + v >= 1) return false;
  const t = dot(e2, qv) / det;
  return t > 0 && t < 1;
}

function trianglesCross(t1: readonly V[], t2: readonly V[]): boolean {
  const [a0, a1, a2] = t1 as [V, V, V];
  const [b0, b1, b2] = t2 as [V, V, V];
  return (
    segmentHitsTriangle(a0, a1, b0, b1, b2) ||
    segmentHitsTriangle(a1, a2, b0, b1, b2) ||
    segmentHitsTriangle(a2, a0, b0, b1, b2) ||
    segmentHitsTriangle(b0, b1, a0, a1, a2) ||
    segmentHitsTriangle(b1, b2, a0, a1, a2) ||
    segmentHitsTriangle(b2, b0, a0, a1, a2)
  );
}

/**
 * Crossing triangle pairs among `tris` (indices into `indices`, triangle-major) at positions `P`;
 * `weld[v]` names the corner a vertex shares with its seam duplicates.
 */
export function crossingPairs(
  P: ArrayLike<number>,
  indices: ArrayLike<number>,
  tris: readonly number[],
  weld: Int32Array,
): number {
  const n = tris.length;
  if (n < 2) return 0;
  const corners: V[][] = [];
  const ids = new Int32Array(n * 3);
  const box = new Float64Array(n * 6);
  let edge = 0;
  tris.forEach((t, i) => {
    const vs = [0, 1, 2].map((k) => {
      const v = indices[t * 3 + k] ?? 0;
      ids[i * 3 + k] = weld[v] ?? v;
      return at(P, v);
    });
    corners.push(vs);
    for (let k = 0; k < 3; k++) {
      box[i * 6 + k] = Math.min(vs[0]?.[k] ?? 0, vs[1]?.[k] ?? 0, vs[2]?.[k] ?? 0);
      box[i * 6 + 3 + k] = Math.max(vs[0]?.[k] ?? 0, vs[1]?.[k] ?? 0, vs[2]?.[k] ?? 0);
    }
    edge += dmath.norm(sub(vs[0] ?? [0, 0, 0], vs[1] ?? [0, 0, 0]));
  });
  const cell = Math.max(1e-6, (edge / n) * 2);
  const grid = new Map<number, number[]>();
  const hash = (x: number, y: number, z: number): number =>
    ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0;
  for (let i = 0; i < n; i++) {
    const lo = [0, 1, 2].map((k) => Math.floor((box[i * 6 + k] ?? 0) / cell));
    const hi = [0, 1, 2].map((k) => Math.floor((box[i * 6 + 3 + k] ?? 0) / cell));
    for (let x = lo[0] ?? 0; x <= (hi[0] ?? 0); x++)
      for (let y = lo[1] ?? 0; y <= (hi[1] ?? 0); y++)
        for (let z = lo[2] ?? 0; z <= (hi[2] ?? 0); z++) {
          const key = hash(x, y, z);
          const list = grid.get(key);
          if (list) list.push(i);
          else grid.set(key, [i]);
        }
  }
  const seen = new Set<number>();
  let count = 0;
  for (const list of grid.values())
    for (let p = 0; p < list.length; p++)
      for (let q = p + 1; q < list.length; q++) {
        const a = Math.min(list[p] ?? 0, list[q] ?? 0);
        const b = Math.max(list[p] ?? 0, list[q] ?? 0);
        let apart = false;
        for (let k = 0; k < 3 && !apart; k++)
          apart =
            (box[a * 6 + k] ?? 0) > (box[b * 6 + 3 + k] ?? 0) ||
            (box[b * 6 + k] ?? 0) > (box[a * 6 + 3 + k] ?? 0);
        if (apart) continue;
        const key = a * n + b;
        if (seen.has(key)) continue;
        seen.add(key);
        let shared = false;
        for (let k = 0; k < 3 && !shared; k++)
          for (let m = 0; m < 3 && !shared; m++) shared = ids[a * 3 + k] === ids[b * 3 + m];
        if (shared) continue;
        if (trianglesCross(corners[a] ?? [], corners[b] ?? [])) count++;
      }
  return count;
}

/** Corner id per vertex: the first vertex at the same position (1 µm grid). */
export function weldIds(P: ArrayLike<number>): Int32Array {
  const n = Math.floor(P.length / 3);
  const out = new Int32Array(n);
  const first = new Map<string, number>();
  for (let v = 0; v < n; v++) {
    const key = [0, 1, 2].map((k) => Math.round((P[v * 3 + k] ?? 0) * 1e6)).join();
    const f = first.get(key);
    out[v] = f ?? v;
    if (f === undefined) first.set(key, v);
  }
  return out;
}
