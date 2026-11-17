// Reading a model mesh's anatomy without its field: surface samples binned into horizontal levels
// of square cells (a level's occupied cells are the outlines of every limb crossing that height;
// 8-connected groups are the separate limbs), and `medial`, which walks a point up the mesh's
// distance field inside the plane across a bone until it sits on the limb's medial axis (the
// centre of the largest inscribed circle of that section). model-legs.ts and model-skeleton.ts
// place joints with them.

import type { Mesh, Vec3 } from '../core/index.ts';
import type { TriBvh } from '../primitives/index.ts';

const STRIDE = 8192;
const HALF = STRIDE / 2;

export const cellKey = (ix: number, iy: number): number => (iy + HALF) * STRIDE + (ix + HALF);
export const cellXY = (key: number): [number, number] => [
  (key % STRIDE) - HALF,
  Math.floor(key / STRIDE) - HALF,
];

/** Surface points: every vertex, plus triangle interiors so no two samples are > `gap` apart. */
export function surfaceCloud(mesh: Mesh, gap: number): Float32Array {
  const P = mesh.positions;
  const out: number[] = Array.from(P);
  const at = (v: number, k: number): number => P[v * 3 + k] ?? 0;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t] ?? 0, mesh.indices[t + 1] ?? 0, mesh.indices[t + 2] ?? 0];
    const edge = Math.max(
      ...[
        [a, b],
        [b, c],
        [c, a],
      ].map(([u, v]) => Math.hypot(...[0, 1, 2].map((k) => at(u ?? 0, k) - at(v ?? 0, k)))),
    );
    const steps = Math.ceil(edge / gap);
    for (let i = 0; i <= steps; i++)
      for (let j = 0; i + j <= steps; j++) {
        if (steps < 2 || ((i === 0 || i === steps) && (j === 0 || i + j === steps))) continue;
        const [u, v] = [i / steps, j / steps];
        for (let k = 0; k < 3; k++) out.push(at(a, k) * (1 - u - v) + at(b, k) * u + at(c, k) * v);
      }
  }
  return Float32Array.from(out);
}

export interface Levels {
  readonly cell: number;
  readonly dz: number;
  /** Occupied cell keys of level k: z in [k·dz, (k + 1)·dz). */
  readonly cells: readonly ReadonlySet<number>[];
}

export function levelsOf(cloud: Float32Array, cell: number, dz: number): Levels {
  const cells: Set<number>[] = [];
  for (let i = 0; i < cloud.length; i += 3) {
    const k = Math.max(0, Math.floor((cloud[i + 2] ?? 0) / dz));
    while (cells.length <= k) cells.push(new Set());
    cells[k]?.add(
      cellKey(Math.floor((cloud[i] ?? 0) / cell), Math.floor((cloud[i + 1] ?? 0) / cell)),
    );
  }
  return { cell, dz, cells };
}

/** Cells of `all` within `reach` cells (Chebyshev) of any cell of `from`. */
export function near(all: ReadonlySet<number>, from: Iterable<number>, reach: number): Set<number> {
  const out = new Set<number>();
  for (const key of from) {
    const [x, y] = cellXY(key);
    for (let dy = -reach; dy <= reach; dy++)
      for (let dx = -reach; dx <= reach; dx++) {
        const k = cellKey(x + dx, y + dy);
        if (all.has(k)) out.add(k);
      }
  }
  return out;
}

/** 8-connected groups of a level's cells, largest first (ties: lowest key first). */
export function components(cells: ReadonlySet<number>): number[][] {
  const seen = new Set<number>();
  const out: number[][] = [];
  for (const start of [...cells].sort((a, b) => a - b)) {
    if (seen.has(start)) continue;
    const group = [start];
    seen.add(start);
    for (let i = 0; i < group.length; i++)
      for (const k of near(cells, [group[i] ?? start], 1))
        if (!seen.has(k)) {
          seen.add(k);
          group.push(k);
        }
    out.push(group.sort((a, b) => a - b));
  }
  return out.sort((a, b) => b.length - a.length || (a[0] ?? 0) - (b[0] ?? 0));
}

/** Centre (middle of the bounding box: an outline's centre) and half-width of a group of cells,
 *  metres. */
export function sectionOf(group: Iterable<number>, cell: number): [number, number, number] {
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const key of group) {
    const [x, y] = cellXY(key);
    [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)];
  }
  return [
    ((x0 + x1 + 1) / 2) * cell,
    ((y0 + y1 + 1) / 2) * cell,
    (Math.max(x1 - x0, y1 - y0) + 1) * 0.5 * cell,
  ];
}

export interface Medial {
  readonly at: Vec3;
  /** Inscribed radius there, metres (0 when the walk never got inside). */
  readonly r: number;
  readonly inside: boolean;
}

/**
 * Walk `p` to the medial axis of the limb it is in (or nearest to), staying in the plane through
 * `p` normal to `axis` and within `reach` metres of `p`. Outside the mesh it first steps through
 * the nearest surface.
 */
export function medial(bvh: TriBvh, p: Vec3, axis: Vec3, reach: number): Medial {
  const al = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const u: Vec3 = [axis[0] / al, axis[1] / al, axis[2] / al];
  const q: [number, number, number] = [0, 0, 0];
  const inside = (x: Vec3): boolean => bvh.winding(x) > 0.5;
  let at: Vec3 = p;
  if (!inside(at)) {
    const d = bvh.closest(at, q);
    const k = (d + Math.min(reach, Math.max(d, 0.002)) * 0.25) / Math.max(d, 1e-9);
    const stepped: Vec3 = [
      at[0] + (q[0] - at[0]) * k,
      at[1] + (q[1] - at[1]) * k,
      at[2] + (q[2] - at[2]) * k,
    ];
    if (!inside(stepped)) return { at: p, r: 0, inside: false };
    at = stepped;
  }
  let r = bvh.closest(at, q);
  let step = Math.max(r * 0.5, reach * 0.05);
  for (let i = 0; i < 40 && step > reach * 1e-3; i++) {
    const g: Vec3 = [at[0] - q[0], at[1] - q[1], at[2] - q[2]];
    const along = g[0] * u[0] + g[1] * u[1] + g[2] * u[2];
    const flat: Vec3 = [g[0] - u[0] * along, g[1] - u[1] * along, g[2] - u[2] * along];
    const l = Math.hypot(flat[0], flat[1], flat[2]);
    if (l < 1e-9) break;
    const next: Vec3 = [
      at[0] + (flat[0] / l) * step,
      at[1] + (flat[1] / l) * step,
      at[2] + (flat[2] / l) * step,
    ];
    const far = Math.hypot(next[0] - p[0], next[1] - p[1], next[2] - p[2]) > reach;
    const keep: [number, number, number] = [q[0], q[1], q[2]];
    const rn = far || !inside(next) ? -1 : bvh.closest(next, q);
    if (rn > r) [at, r] = [next, rn];
    else {
      [q[0], q[1], q[2]] = keep;
      step *= 0.5;
    }
  }
  return { at, r, inside: true };
}
