// Skin weights for imported meshes (scans, CC0 base meshes) whose sculpt field is unknown: voxelise
// the solid (surface shell + interior by exterior flood fill), then per bone the geodesic distance
// through the solid from the bone's voxels (26-neighbour Dijkstra), and weights exp(−(d − d_min)/k)
// as in skin-weights.ts. Distance runs through flesh, never through air, so a leg never bleeds
// onto the leg beside it across the gap. Deterministic: fixed grid, fixed neighbour order.

import { type Mesh, SKIN_INFLUENCES, type Vec3 } from '../core/index.ts';
import {
  capsuleDistance,
  checkBones,
  influencesFrom,
  type SkinWeightOptions,
  type WeightBone,
  writeInfluences,
} from './skin-weights.ts';

const v3 = (f: (k: number) => number): Vec3 => [f(0), f(1), f(2)];

export interface HeatOptions extends SkinWeightOptions {
  /** Voxel edge, metres; coarsened so the grid stays under `maxVoxels`. */
  readonly cell: number;
  /** Default 2^21. */
  readonly maxVoxels?: number;
}

interface Grid {
  readonly lo: Vec3;
  readonly cell: number;
  readonly n: readonly [number, number, number];
  readonly solid: Uint8Array;
}

const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

const NEIGHBOURS: readonly (readonly [number, number, number, number])[] = (() => {
  const out: [number, number, number, number][] = [];
  for (let z = -1; z <= 1; z++)
    for (let y = -1; y <= 1; y++)
      for (let x = -1; x <= 1; x++) if (x || y || z) out.push([x, y, z, Math.hypot(x, y, z)]);
  return out;
})();

function voxelise(mesh: Mesh, o: HeatOptions): Grid {
  const p = mesh.positions;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i++) {
    const k = i % 3;
    lo[k] = Math.min(lo[k] ?? 0, p[i] ?? 0);
    hi[k] = Math.max(hi[k] ?? 0, p[i] ?? 0);
  }
  const span = (k: number): number => (hi[k] ?? 0) - (lo[k] ?? 0);
  const cap = o.maxVoxels ?? 2 ** 21;
  let cell = o.cell;
  const dims = (c: number): [number, number, number] =>
    v3((k) => Math.ceil(span(k) / c) + 3) as [number, number, number];
  while (dims(cell).reduce((a, b) => a * b, 1) > cap) cell *= 1.25;
  const n = dims(cell);
  const origin = v3((k) => (lo[k] ?? 0) - cell);
  const solid = new Uint8Array(n[0] * n[1] * n[2]);
  const mark = (x: number, y: number, z: number): void => {
    const i = Math.floor((x - origin[0]) / cell);
    const j = Math.floor((y - origin[1]) / cell);
    const k = Math.floor((z - origin[2]) / cell);
    solid[(k * n[1] + j) * n[0] + i] = 1;
  };
  // Surface shell: sample every triangle at ≤ half a cell.
  const at = (v: number, k: number): number => p[v * 3 + k] ?? 0;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((s) => mesh.indices[t + s] ?? 0) as [number, number, number];
    const edge = Math.max(
      ...[
        [a, b],
        [b, c],
        [c, a],
      ].map(([u, v]) => Math.hypot(...[0, 1, 2].map((k) => at(u ?? 0, k) - at(v ?? 0, k)))),
    );
    const steps = Math.max(1, Math.ceil(edge / (cell * 0.5)));
    for (let i = 0; i <= steps; i++)
      for (let j = 0; i + j <= steps; j++) {
        const u = i / steps;
        const v = j / steps;
        const w = 1 - u - v;
        mark(
          ...([0, 1, 2].map((k) => at(a, k) * w + at(b, k) * u + at(c, k) * v) as [
            number,
            number,
            number,
          ]),
        );
      }
  }
  // Interior: everything the outside flood cannot reach.
  const outside = new Uint8Array(solid.length);
  const queue = [0];
  outside[0] = 1;
  while (queue.length) {
    const i = queue.pop() ?? 0;
    const x = i % n[0];
    const y = Math.floor(i / n[0]) % n[1];
    const z = Math.floor(i / (n[0] * n[1]));
    for (const [dx, dy, dz] of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ] as const) {
      const X = x + dx;
      const Y = y + dy;
      const Z = z + dz;
      if (X < 0 || Y < 0 || Z < 0 || X >= n[0] || Y >= n[1] || Z >= n[2]) continue;
      const j = (Z * n[1] + Y) * n[0] + X;
      if (outside[j] || solid[j]) continue;
      outside[j] = 1;
      queue.push(j);
    }
  }
  for (let i = 0; i < solid.length; i++) if (!outside[i]) solid[i] = 1;
  return { lo: origin, cell, n, solid };
}

const voxelOf = (g: Grid, q: Vec3): number => {
  const c = [0, 1, 2].map((k) =>
    Math.min((g.n[k] ?? 1) - 1, Math.max(0, Math.floor(((q[k] ?? 0) - (g.lo[k] ?? 0)) / g.cell))),
  ) as [number, number, number];
  return (c[2] * g.n[1] + c[1]) * g.n[0] + c[0];
};

/** Geodesic distance (m) through the solid from the bone's voxels to every voxel. */
function geodesic(g: Grid, bone: WeightBone): Float64Array {
  const dist = new Float64Array(g.solid.length).fill(Infinity);
  const heap: number[] = [];
  const push = (i: number, d: number): void => {
    if (!(d < (dist[i] ?? Infinity))) return;
    dist[i] = d;
    heap.push(i);
    let c = heap.length - 1;
    while (c > 0) {
      const pa = (c - 1) >> 1;
      if ((dist[heap[pa] ?? 0] ?? 0) <= d) break;
      [heap[c], heap[pa]] = [heap[pa] ?? 0, heap[c] ?? 0];
      c = pa;
    }
  };
  const pop = (): number => {
    const top = heap[0] ?? 0;
    const last = heap.pop() ?? 0;
    if (heap.length) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const l = c * 2 + 1;
        const r = l + 1;
        let m = c;
        if (l < heap.length && (dist[heap[l] ?? 0] ?? 0) < (dist[heap[m] ?? 0] ?? 0)) m = l;
        if (r < heap.length && (dist[heap[r] ?? 0] ?? 0) < (dist[heap[m] ?? 0] ?? 0)) m = r;
        if (m === c) break;
        [heap[c], heap[m]] = [heap[m] ?? 0, heap[c] ?? 0];
        c = m;
      }
    }
    return top;
  };
  const len = Math.hypot(...[0, 1, 2].map((k) => (bone.b[k] ?? 0) - (bone.a[k] ?? 0)));
  const steps = Math.max(1, Math.ceil(len / (g.cell * 0.5)));
  for (let s = 0; s <= steps; s++) {
    const q = v3((k) => (bone.a[k] ?? 0) + ((bone.b[k] ?? 0) - (bone.a[k] ?? 0)) * (s / steps));
    const i = voxelOf(g, q);
    if (g.solid[i]) push(i, 0);
  }
  const done = new Uint8Array(g.solid.length);
  while (heap.length) {
    const i = pop();
    if (done[i]) continue;
    done[i] = 1;
    const x = i % g.n[0];
    const y = Math.floor(i / g.n[0]) % g.n[1];
    const z = Math.floor(i / (g.n[0] * g.n[1]));
    for (const [dx, dy, dz, w] of NEIGHBOURS) {
      const X = x + dx;
      const Y = y + dy;
      const Z = z + dz;
      if (X < 0 || Y < 0 || Z < 0 || X >= g.n[0] || Y >= g.n[1] || Z >= g.n[2]) continue;
      const j = (Z * g.n[1] + Y) * g.n[0] + X;
      if (g.solid[j] && !done[j]) push(j, (dist[i] ?? 0) + w * g.cell);
    }
  }
  return dist;
}

/** Weights by geodesic distance through the voxelised solid. Same mesh + joints + weights. */
export function heatWeights(mesh: Mesh, bones: readonly WeightBone[], o: HeatOptions): Mesh {
  const only = checkBones(bones, o);
  const off = o.offset ?? [0, 0, 0];
  const local = bones.map((b) => ({ ...b, a: sub3(b.a, off), b: sub3(b.b, off) }));
  const g = voxelise(mesh, o);
  const n = mesh.positions.length / 3;
  const voxel = Int32Array.from({ length: n }, (_, v) =>
    voxelOf(
      g,
      v3((k) => mesh.positions[v * 3 + k] ?? 0),
    ),
  );
  const d = only.map((i) => {
    const field = geodesic(g, local[i] as WeightBone);
    return Float64Array.from(voxel, (x) => field[x] ?? Infinity);
  });
  const joints = new Uint16Array(n * SKIN_INFLUENCES);
  const weights = new Float32Array(n * SKIN_INFLUENCES);
  for (let v = 0; v < n; v++) {
    const dv = d.map((x) => x[v] ?? Infinity);
    // A vertex the solid never reached (a stray sliver): fall back to straight-line distance.
    const p = v3((k) => mesh.positions[v * 3 + k] ?? 0);
    const use = dv.some(Number.isFinite)
      ? dv
      : only.map((i) => capsuleDistance(p, local[i] as WeightBone));
    writeInfluences(joints, weights, v, influencesFrom(use, only, o.blend));
  }
  return { ...mesh, joints, weights };
}
