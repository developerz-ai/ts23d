// Pieces for the `connections` gate: every part's world mesh split into its disconnected shells
// (a merged mesh hides islands — a tooth row merged into the jaw is many shells), each with the
// bounds, area, closedness, enclosed volume and a sub-mesh the spatial indices are built on.
// Vertices weld by position (0.1 mm), so flat-shaded faces that own their vertices stay one shell.

import { type Bounds, type CompiledAsset, type Mesh, worldMeshes } from '../core/index.ts';

export interface Shell {
  /** Stable id: `part#index` (index in first-triangle order). */
  readonly id: string;
  readonly part: string;
  readonly index: number;
  /** Shell triangles as a stand-alone world-space mesh (shares nothing with the part mesh). */
  readonly mesh: Mesh;
  readonly bounds: Bounds;
  readonly area: number;
  /** Every welded edge has exactly two triangles. */
  readonly closed: boolean;
  /** Closed, or nearly (< 2 % open edges: a sculpt cut open at the neck): inside tests hold. */
  readonly solid: boolean;
  /** Enclosed volume (solid shells; 0 otherwise). */
  readonly volume: number;
  readonly centroid: readonly [number, number, number];
}

const Q = 1e4;

/** Welded vertex id per vertex: equal positions (to 0.1 mm) share one id. */
export function weld(m: Mesh): Int32Array {
  const n = m.positions.length / 3;
  const ids = new Int32Array(n);
  const table = new Map<number, number[]>();
  const P = m.positions;
  for (let i = 0; i < n; i++) {
    const x = Math.round((P[i * 3] ?? 0) * Q);
    const y = Math.round((P[i * 3 + 1] ?? 0) * Q);
    const z = Math.round((P[i * 3 + 2] ?? 0) * Q);
    const h = ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) | 0;
    const bucket = table.get(h);
    let found = -1;
    if (bucket)
      for (const j of bucket)
        if (
          Math.round((P[j * 3] ?? 0) * Q) === x &&
          Math.round((P[j * 3 + 1] ?? 0) * Q) === y &&
          Math.round((P[j * 3 + 2] ?? 0) * Q) === z
        ) {
          found = j;
          break;
        }
    if (found >= 0) ids[i] = ids[found] ?? i;
    else {
      ids[i] = i;
      if (bucket) bucket.push(i);
      else table.set(h, [i]);
    }
  }
  return ids;
}

function find(parent: Int32Array, i: number): number {
  let r = i;
  while ((parent[r] ?? r) !== r) r = parent[r] ?? r;
  let k = i;
  while ((parent[k] ?? k) !== r) {
    const next = parent[k] ?? k;
    parent[k] = r;
    k = next;
  }
  return r;
}

function shellMesh(m: Mesh, tris: readonly number[]): Mesh {
  const positions = new Float32Array(tris.length * 9);
  const normals = new Float32Array(tris.length * 9);
  const colors = new Float32Array(tris.length * 9);
  tris.forEach((t, k) => {
    for (let v = 0; v < 3; v++) {
      const i = m.indices[t * 3 + v] ?? 0;
      for (let c = 0; c < 3; c++) {
        positions[k * 9 + v * 3 + c] = m.positions[i * 3 + c] ?? 0;
        normals[k * 9 + v * 3 + c] = m.normals[i * 3 + c] ?? 0;
        colors[k * 9 + v * 3 + c] = m.colors[i * 3 + c] ?? 0;
      }
    }
  });
  const indices = new Uint32Array(tris.length * 3).map((_, i) => i);
  return { positions, normals, colors, uvs: new Float32Array(tris.length * 6), indices };
}

function describe(part: string, index: number, m: Mesh, open: number, edges: number): Shell {
  const closed = edges > 0 && open === 0;
  const P = m.positions;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const v = P[i + k] ?? 0;
      if (v < (min[k] ?? 0)) min[k] = v;
      if (v > (max[k] ?? 0)) max[k] = v;
    }
  let area = 0;
  let volume = 0;
  const c: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < P.length; i += 9) {
    const [ax, ay, az] = [P[i] ?? 0, P[i + 1] ?? 0, P[i + 2] ?? 0];
    const [bx, by, bz] = [P[i + 3] ?? 0, P[i + 4] ?? 0, P[i + 5] ?? 0];
    const [cx, cy, cz] = [P[i + 6] ?? 0, P[i + 7] ?? 0, P[i + 8] ?? 0];
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    const a = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    area += a;
    c[0] += (a * (ax + bx + cx)) / 3;
    c[1] += (a * (ay + by + cy)) / 3;
    c[2] += (a * (az + bz + cz)) / 3;
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  const centroid: [number, number, number] =
    area > 0 ? [c[0] / area, c[1] / area, c[2] / area] : [min[0], min[1], min[2]];
  return {
    id: `${part}#${index}`,
    part,
    index,
    mesh: m,
    bounds: { min, max },
    area,
    closed,
    solid: edges > 0 && open / edges < 0.02,
    volume: edges > 0 && open / edges < 0.02 ? Math.abs(volume) : 0,
    centroid,
  };
}

/** The disconnected shells of one mesh, in first-triangle order (deterministic). */
export function splitShells(part: string, m: Mesh): Shell[] {
  const ids = weld(m);
  const nv = ids.length;
  const parent = new Int32Array(nv).map((_, i) => i);
  const I = m.indices;
  const nt = I.length / 3;
  for (let t = 0; t < nt; t++) {
    const a = find(parent, ids[I[t * 3] ?? 0] ?? 0);
    for (let v = 1; v < 3; v++) {
      const b = find(parent, ids[I[t * 3 + v] ?? 0] ?? 0);
      if (a !== b) parent[b] = a;
    }
  }
  const groups = new Map<number, number[]>();
  for (let t = 0; t < nt; t++) {
    const r = find(parent, ids[I[t * 3] ?? 0] ?? 0);
    const g = groups.get(r);
    if (g) g.push(t);
    else groups.set(r, [t]);
  }
  const edges = new Map<number, number>();
  const shells: Shell[] = [];
  for (const tris of groups.values()) {
    edges.clear();
    for (const t of tris)
      for (let v = 0; v < 3; v++) {
        const a = ids[I[t * 3 + v] ?? 0] ?? 0;
        const b = ids[I[t * 3 + ((v + 1) % 3)] ?? 0] ?? 0;
        if (a === b) continue;
        const k = Math.min(a, b) * nv + Math.max(a, b);
        edges.set(k, (edges.get(k) ?? 0) + 1);
      }
    let open = 0;
    for (const n of edges.values()) if (n !== 2) open++;
    shells.push(describe(part, shells.length, shellMesh(m, tris), open, edges.size));
  }
  return shells;
}

const cache = new WeakMap<Mesh, Shell[]>();

/** Every shell of every part with geometry (world space), cached per world mesh. */
export function assetShells(asset: CompiledAsset): Shell[] {
  const out: Shell[] = [];
  for (const [name, m] of worldMeshes(asset.parts)) {
    const hit = cache.get(m) ?? splitShells(name, m);
    cache.set(m, hit);
    out.push(...hit);
  }
  return out;
}
