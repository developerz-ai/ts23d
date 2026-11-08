// Splits a mesh into shells: triangles connected through shared (welded) positions. Primitives
// duplicate vertices at hard edges, so connectivity uses positions on a 0.01 mm grid. A shell is
// closed when every edge is used exactly twice, once in each direction (watertight, consistent);
// balanced when every directed edge is matched by as many reverse uses (a closed surface that may
// be non-manifold, e.g. two boxes sharing an edge: its signed volume is still exact).

import type { Mesh } from '../core/index.ts';

export interface Shell {
  /** Triangle indices (into mesh.indices / 3), ascending. */
  readonly triangles: readonly number[];
  readonly closed: boolean;
  /** Every directed edge used as often as its reverse (true whenever `closed`). */
  readonly balanced: boolean;
}

function weldIds(positions: Float32Array): Uint32Array {
  const ids = new Uint32Array(positions.length / 3);
  const map = new Map<string, number>();
  for (let i = 0; i < ids.length; i++) {
    const key = `${Math.round((positions[i * 3] ?? 0) * 1e5)},${Math.round((positions[i * 3 + 1] ?? 0) * 1e5)},${Math.round((positions[i * 3 + 2] ?? 0) * 1e5)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = map.size;
      map.set(key, id);
    }
    ids[i] = id;
  }
  return ids;
}

function find(parent: Uint32Array, i: number): number {
  let r = i;
  while ((parent[r] ?? r) !== r) r = parent[r] ?? r;
  let c = i;
  while (c !== r) {
    const next = parent[c] ?? r;
    parent[c] = r;
    c = next;
  }
  return r;
}

export function shellsOf(mesh: Mesh): Shell[] {
  const ids = weldIds(mesh.positions);
  const triCount = mesh.indices.length / 3;
  const vertCount = ids.reduce((m, v) => Math.max(m, v + 1), 0);
  const parent = Uint32Array.from({ length: vertCount }, (_, i) => i);
  const w = (t: number, k: number): number => ids[mesh.indices[t * 3 + k] ?? 0] ?? 0;
  for (let t = 0; t < triCount; t++) {
    const a = find(parent, w(t, 0));
    for (const k of [1, 2]) {
      const b = find(parent, w(t, k));
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
  }
  const groups = new Map<number, number[]>();
  for (let t = 0; t < triCount; t++) {
    if (w(t, 0) === w(t, 1) || w(t, 1) === w(t, 2) || w(t, 2) === w(t, 0)) continue; // degenerate
    const root = find(parent, w(t, 0));
    const g = groups.get(root);
    if (g) g.push(t);
    else groups.set(root, [t]);
  }
  return [...groups.values()].map((triangles) => ({
    triangles,
    ...closure(triangles, w, vertCount),
  }));
}

function closure(
  tris: readonly number[],
  w: (t: number, k: number) => number,
  verts: number,
): { closed: boolean; balanced: boolean } {
  // Directed edge a→b keyed a·V + b (exact below 2^53, i.e. any mesh that fits in memory).
  const directed = new Map<number, number>();
  for (const t of tris)
    for (let k = 0; k < 3; k++) {
      const key = w(t, k) * verts + w(t, (k + 1) % 3);
      directed.set(key, (directed.get(key) ?? 0) + 1);
    }
  let closed = true;
  for (const [key, n] of directed) {
    const a = Math.floor(key / verts);
    const back = directed.get((key - a * verts) * verts + a);
    if (back !== n) return { closed: false, balanced: false };
    if (n !== 1) closed = false;
  }
  return { closed, balanced: true };
}
