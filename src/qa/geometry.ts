// Exact-enough geometry for QA: point↔triangle distance, a triangle spatial hash, and surface
// samples. Bounding boxes lie (a diagonal strut's box touches everything); surfaces don't.

import { boundsOf, type Mesh, type Vec3 } from '../core/index.ts';
import { pointTriDist } from './point-triangle.ts';

export { pointTriangleDistance, pointTriDist } from './point-triangle.ts';

const at = (m: Mesh, i: number): Vec3 => [
  m.positions[i * 3] ?? 0,
  m.positions[i * 3 + 1] ?? 0,
  m.positions[i * 3 + 2] ?? 0,
];
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
    const P = mesh.positions;
    const I = mesh.indices;
    const lo = [0, 0, 0];
    const hi = [0, 0, 0];
    for (let t = 0; t < n; t++) {
      for (let v = 0; v < 3; v++) {
        const i = (I[t * 3 + v] ?? 0) * 3;
        for (let k = 0; k < 3; k++) this.tris[t * 9 + v * 3 + k] = P[i + k] ?? 0;
      }
      for (let k = 0; k < 3; k++) {
        const a = this.tris[t * 9 + k] ?? 0;
        const b = this.tris[t * 9 + 3 + k] ?? 0;
        const c = this.tris[t * 9 + 6 + k] ?? 0;
        const mn = Math.min(a, b, c);
        const mx = Math.max(a, b, c);
        this.boxes[t * 6 + k] = mn;
        this.boxes[t * 6 + 3 + k] = mx;
        lo[k] = Math.floor(mn / CELL);
        hi[k] = Math.floor(mx / CELL);
      }
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
            const d = pointTriDist(
              p[0],
              p[1],
              p[2],
              T[o] ?? 0,
              T[o + 1] ?? 0,
              T[o + 2] ?? 0,
              T[o + 3] ?? 0,
              T[o + 4] ?? 0,
              T[o + 5] ?? 0,
              T[o + 6] ?? 0,
              T[o + 7] ?? 0,
              T[o + 8] ?? 0,
            );
            if (d < best) best = d;
          }
        }
    return best <= radius ? best : Infinity;
  }
}

// Gates and checks ask for the same mesh's samples many times; compute each (mesh, density) once.
const sampleCache = new WeakMap<Mesh, Map<string, Vec3[]>>();

/**
 * Vertices, points along every edge every `step` metres (catches crossing members) and each
 * triangle's centroid. With `maxInterior > 0`, triangles whose longest edge exceeds `step` also
 * get a barycentric lattice at spacing `step`, at most `maxInterior` points each: a rotor through
 * the middle of a big panel touches no edge. Cost: up to `maxInterior` extra points per big
 * triangle, so only gates that need face interiors (clashes) ask for them.
 */
export function surfaceSamples(m: Mesh, step = 0.05, maxPerEdge = 16, maxInterior = 0): Vec3[] {
  const key = `${step}:${maxPerEdge}:${maxInterior}`;
  const byMesh = sampleCache.get(m) ?? new Map<string, Vec3[]>();
  sampleCache.set(m, byMesh);
  const hit = byMesh.get(key);
  if (hit) return hit;
  const out = sampleMesh(m, step, maxPerEdge, maxInterior);
  byMesh.set(key, out);
  return out;
}

const dist = (a: Vec3, b: Vec3): number => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

/** Lattice divisions n with (n-1)(n-2)/2 interior points ≤ cap. */
const latticeCap = (cap: number): number => Math.floor((3 + Math.sqrt(1 + 8 * cap)) / 2);

function interior(tri: readonly [Vec3, Vec3, Vec3], step: number, cap: number, out: Vec3[]): void {
  const [a, b, c] = tri;
  const longest = Math.max(dist(a, b), dist(b, c), dist(c, a));
  if (longest <= step) return;
  const n = Math.min(Math.ceil(longest / step), latticeCap(cap));
  for (let i = 1; i < n - 1; i++)
    for (let j = 1; i + j < n; j++) {
      const u = i / n;
      const v = j / n;
      out.push([
        a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v,
        a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v,
        a[2] + (b[2] - a[2]) * u + (c[2] - a[2]) * v,
      ]);
    }
}

function sampleMesh(m: Mesh, step: number, maxPerEdge: number, maxInterior: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < m.positions.length / 3; i++) out.push(at(m, i));
  for (let t = 0; t < m.indices.length / 3; t++) {
    const tri = triangle(m, t);
    for (let e = 0; e < 3; e++) {
      const a = tri[e] ?? tri[0];
      const b = tri[(e + 1) % 3] ?? tri[0];
      const n = Math.min(maxPerEdge, Math.floor(dist(a, b) / step));
      for (let s = 1; s < n; s++) out.push(lerp(a, b, s / n));
    }
    out.push(lerp(lerp(tri[0], tri[1], 0.5), tri[2], 1 / 3));
    if (maxInterior > 0) interior(tri, step, maxInterior, out);
  }
  return out;
}
