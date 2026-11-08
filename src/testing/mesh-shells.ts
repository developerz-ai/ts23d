// Connected shells of a mesh (triangles linked through welded vertices). A part is often several
// closed solids merged — overlapping boxes, a hub inside a tyre — and parity/thickness rays only
// make sense against the shell they start on. Each shell is a compact mesh of its own;
// `shellProbes` hands out face-centre probes on the watertight ones.

import type { Mesh, Vec3 } from '../core/index.ts';
import { corners, faceNormal, sampleTriangles, weldIds } from './mesh-input.ts';
import { selfIntersections } from './mesh-intersect.ts';
import { RayGrid } from './mesh-ray.ts';
import { topology } from './mesh-topology.ts';

export function shells(m: Mesh): Mesh[] {
  const ids = weldIds(m);
  let count = 0;
  for (const id of ids) count = Math.max(count, id + 1);
  const parent = Int32Array.from({ length: count }, (_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while ((parent[r] ?? r) !== r) r = parent[r] ?? r;
    while ((parent[x] ?? x) !== r) {
      const next = parent[x] ?? x;
      parent[x] = r;
      x = next;
    }
    return r;
  };
  const n = m.indices.length / 3;
  for (let t = 0; t < n; t++) {
    for (let j = 1; j < 3; j++) {
      const a = find(ids[m.indices[t * 3] ?? 0] ?? 0);
      const b = find(ids[m.indices[t * 3 + j] ?? 0] ?? 0);
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
  }
  const groups = new Map<number, number[]>();
  for (let t = 0; t < n; t++) {
    const root = find(ids[m.indices[t * 3] ?? 0] ?? 0);
    const g = groups.get(root) ?? [];
    for (let j = 0; j < 3; j++) g.push(m.indices[t * 3 + j] ?? 0);
    groups.set(root, g);
  }
  return [...groups.values()].map((idx) => compact(m, idx));
}

/** A standalone mesh of the listed corners: only the vertices they use, re-indexed. */
function compact(m: Mesh, idx: readonly number[]): Mesh {
  const map = new Map<number, number>();
  for (const i of idx) if (!map.has(i)) map.set(i, map.size);
  const pick = (src: Float32Array, k: number): Float32Array => {
    const out = new Float32Array(map.size * k);
    for (const [from, to] of map) out.set(src.subarray(from * k, from * k + k), to * k);
    return out;
  };
  return {
    positions: pick(m.positions, 3),
    normals: pick(m.normals, 3),
    uvs: pick(m.uvs, 2),
    colors: pick(m.colors, 3),
    indices: Uint32Array.from(idx, (i) => map.get(i) ?? 0),
  };
}

export interface Probe {
  readonly grid: RayGrid;
  /** Triangle index within the shell (pass as `skip` to grid.cast). */
  readonly tri: number;
  readonly centre: Vec3;
  /** Unit winding normal. */
  readonly normal: Vec3;
}

/**
 * Face probes over every watertight shell of `m` that does not cross itself (inside/outside is
 * undefined there — assertNoSelfIntersection reports those): about `samples` face centres in all,
 * spread over the shells by triangle count (at least 8 each), each with its own shell's ray grid.
 */
export function shellProbes(m: Mesh, samples: number): Probe[] {
  const total = Math.max(1, m.indices.length / 3);
  const out: Probe[] = [];
  for (const shell of shells(m)) {
    if (topology(shell).boundary > 0 || selfIntersections(shell, 1).pairs > 0) continue;
    const grid = new RayGrid(shell);
    const n = shell.indices.length / 3;
    for (const tri of sampleTriangles(shell, Math.max(8, Math.round((samples * n) / total)))) {
      const c = corners(shell, tri);
      const normal = faceNormal(c);
      if (normal[0] === 0 && normal[1] === 0 && normal[2] === 0) continue;
      const centre: Vec3 = [
        (c[0][0] + c[1][0] + c[2][0]) / 3,
        (c[0][1] + c[1][1] + c[2][1]) / 3,
        (c[0][2] + c[1][2] + c[2][2]) / 3,
      ];
      out.push({ grid, tri, centre, normal });
    }
  }
  return out;
}
