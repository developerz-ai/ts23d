// Exact-enough geometry for QA: point↔triangle distance, a triangle spatial hash, and surface
// samples. Bounding boxes lie (a diagonal strut's box touches everything); surfaces don't.

import { boundsOf, type Mesh, type Vec3 } from '../core/index.ts';

const at = (m: Mesh, i: number): Vec3 => [
  m.positions[i * 3] ?? 0,
  m.positions[i * 3 + 1] ?? 0,
  m.positions[i * 3 + 2] ?? 0,
];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export function triangle(m: Mesh, t: number): [Vec3, Vec3, Vec3] {
  return [
    at(m, m.indices[t * 3] ?? 0),
    at(m, m.indices[t * 3 + 1] ?? 0),
    at(m, m.indices[t * 3 + 2] ?? 0),
  ];
}

/** Distance from p to triangle abc (Ericson, Real-Time Collision Detection §5.1.5). */
export function pointTriangleDistance(p: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return Math.hypot(...ap);
  const bp = sub(p, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return Math.hypot(...bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return Math.hypot(...sub(p, lerp(a, b, d1 / (d1 - d3))));
  const cp = sub(p, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return Math.hypot(...cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return Math.hypot(...sub(p, lerp(a, c, d2 / (d2 - d6))));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0)
    return Math.hypot(...sub(p, lerp(b, c, (d4 - d3) / (d4 - d3 + (d5 - d6)))));
  const den = 1 / (va + vb + vc);
  const v = vb * den;
  const w = vc * den;
  return Math.hypot(
    ...sub(p, [
      a[0] + ab[0] * v + ac[0] * w,
      a[1] + ab[1] * v + ac[1] * w,
      a[2] + ab[2] * v + ac[2] * w,
    ]),
  );
}

// Numeric cell keys (no string building per query) — collisions only add candidates, never drop.
const key = (x: number, y: number, z: number): number =>
  ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) | 0;

/** Triangles bucketed by a uniform grid, so a point only tests its neighbourhood. */
export class TriangleGrid {
  private readonly cells = new Map<number, number[]>();
  /** Cell edge: 25 cm for props and vehicles, growing with big meshes (a 330 m tower) so one
   *  long triangle never lands in 10⁵ cells. */
  private readonly cell: number;
  private readonly tris: Float64Array;
  /** Per-triangle AABB (min xyz, max xyz) for a cheap reject before the exact distance. */
  private readonly boxes: Float64Array;
  private readonly stamp: Int32Array;
  private query = 0;

  constructor(mesh: Mesh) {
    const n = mesh.indices.length / 3;
    this.tris = new Float64Array(n * 9);
    this.boxes = new Float64Array(n * 6);
    this.stamp = new Int32Array(n);
    const b = boundsOf(mesh);
    const diag = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
    this.cell = Math.max(0.25, diag / 256);
    const CELL = this.cell;
    for (let t = 0; t < n; t++) {
      const [a, b, c] = triangle(mesh, t);
      this.tris.set([...a, ...b, ...c], t * 9);
      for (let k = 0; k < 3; k++) {
        this.boxes[t * 6 + k] = Math.min(a[k] ?? 0, b[k] ?? 0, c[k] ?? 0);
        this.boxes[t * 6 + 3 + k] = Math.max(a[k] ?? 0, b[k] ?? 0, c[k] ?? 0);
      }
      const lo = [0, 1, 2].map((k) => Math.floor(Math.min(a[k] ?? 0, b[k] ?? 0, c[k] ?? 0) / CELL));
      const hi = [0, 1, 2].map((k) => Math.floor(Math.max(a[k] ?? 0, b[k] ?? 0, c[k] ?? 0) / CELL));
      for (let x = lo[0] ?? 0; x <= (hi[0] ?? 0); x++)
        for (let y = lo[1] ?? 0; y <= (hi[1] ?? 0); y++)
          for (let z = lo[2] ?? 0; z <= (hi[2] ?? 0); z++) {
            const k = key(x, y, z);
            const list = this.cells.get(k);
            if (list) list.push(t);
            else this.cells.set(k, [t]);
          }
    }
  }

  /** Distance from p to the nearest triangle, if one is within `radius`; else Infinity. */
  nearest(p: Vec3, radius: number): number {
    const CELL = this.cell;
    // Only the cells the query sphere overlaps — usually 1–8, not a fixed 27.
    const [x0, y0, z0] = [
      Math.floor((p[0] - radius) / CELL),
      Math.floor((p[1] - radius) / CELL),
      Math.floor((p[2] - radius) / CELL),
    ];
    const [x1, y1, z1] = [
      Math.floor((p[0] + radius) / CELL),
      Math.floor((p[1] + radius) / CELL),
      Math.floor((p[2] + radius) / CELL),
    ];
    const q = ++this.query;
    const T = this.tris;
    const B = this.boxes;
    let best = Infinity;
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const list = this.cells.get(key(x, y, z));
          if (!list) continue;
          for (const t of list) {
            if (this.stamp[t] === q) continue;
            this.stamp[t] = q;
            const lim = Math.min(best, radius);
            const o6 = t * 6;
            if (
              p[0] < (B[o6] ?? 0) - lim ||
              p[0] > (B[o6 + 3] ?? 0) + lim ||
              p[1] < (B[o6 + 1] ?? 0) - lim ||
              p[1] > (B[o6 + 4] ?? 0) + lim ||
              p[2] < (B[o6 + 2] ?? 0) - lim ||
              p[2] > (B[o6 + 5] ?? 0) + lim
            )
              continue;
            const o = t * 9;
            const d = pointTriangleDistance(
              p,
              [T[o] ?? 0, T[o + 1] ?? 0, T[o + 2] ?? 0],
              [T[o + 3] ?? 0, T[o + 4] ?? 0, T[o + 5] ?? 0],
              [T[o + 6] ?? 0, T[o + 7] ?? 0, T[o + 8] ?? 0],
            );
            if (d < best) best = d;
          }
        }
    return best <= radius ? best : Infinity;
  }
}

// Gates and checks ask for the same mesh's samples many times; compute each (mesh, density) once.
const sampleCache = new WeakMap<Mesh, Map<string, Vec3[]>>();

/** Vertices plus points along every edge every `step` metres (catches crossing members). */
export function surfaceSamples(m: Mesh, step = 0.05, maxPerEdge = 16): Vec3[] {
  const key = `${step}:${maxPerEdge}`;
  const byMesh = sampleCache.get(m) ?? new Map<string, Vec3[]>();
  sampleCache.set(m, byMesh);
  const hit = byMesh.get(key);
  if (hit) return hit;
  const out = sampleMesh(m, step, maxPerEdge);
  byMesh.set(key, out);
  return out;
}

function sampleMesh(m: Mesh, step: number, maxPerEdge: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < m.positions.length / 3; i++) out.push(at(m, i));
  for (let t = 0; t < m.indices.length / 3; t++) {
    const tri = triangle(m, t);
    for (let e = 0; e < 3; e++) {
      const a = tri[e] ?? tri[0];
      const b = tri[(e + 1) % 3] ?? tri[0];
      const n = Math.min(maxPerEdge, Math.floor(Math.hypot(...sub(b, a)) / step));
      for (let s = 1; s < n; s++) out.push(lerp(a, b, s / n));
    }
    out.push(lerp(lerp(tri[0], tri[1], 0.5), tri[2], 1 / 3));
  }
  return out;
}
