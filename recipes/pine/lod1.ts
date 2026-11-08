// LOD1 crown for the pine: the kind's LOD1 lays one big flat cluster card per (unemitted) twig,
// which reads sparse, level and much lighter than LOD0's crossed needle brushes (a visible pop).
// Instead keep every `every`-th LOD0 tuft (perStem tufts per twig are consecutive, so every 4th
// is one per twig) and grow it about its own centre so the crown keeps its coverage and value.

import type { Mesh } from '@developerz.ai/ts23d';

/** One needle tuft = two crossed double-sided 14-point brush cards (vegetation-needles.ts). */
const TUFT = { tris: 48, verts: 56 } as const;

/** True when `m` is a run of whole tufts, each owning its own contiguous vertex block. */
function isTufts(m: Mesh): boolean {
  const n = m.indices.length / 3 / TUFT.tris;
  if (!Number.isInteger(n) || m.positions.length / 3 !== n * TUFT.verts) return false;
  for (let i = 0; i < m.indices.length; i++) {
    const t = Math.floor(i / (TUFT.tris * 3));
    const v = m.indices[i] ?? 0;
    if (v < t * TUFT.verts || v >= (t + 1) * TUFT.verts) return false;
  }
  return true;
}

export function thinTufts(m: Mesh, every: number, scale: number): Mesh {
  if (!isTufts(m)) return m;
  const n = m.indices.length / 3 / TUFT.tris;
  const keep = Array.from({ length: Math.ceil(n / every) }, (_, k) => k * every + 1).filter(
    (t) => t < n,
  );
  const V = TUFT.verts;
  const positions = new Float32Array(keep.length * V * 3);
  const normals = new Float32Array(keep.length * V * 3);
  const colors = new Float32Array(keep.length * V * 3);
  const uvs = new Float32Array(keep.length * V * 2);
  const indices = new Uint32Array(keep.length * TUFT.tris * 3);
  for (const [k, t] of keep.entries()) {
    const c: [number, number, number] = [0, 0, 0];
    for (let v = 0; v < V; v++)
      for (let a = 0; a < 3; a++) c[a] = (c[a] ?? 0) + (m.positions[(t * V + v) * 3 + a] ?? 0) / V;
    for (let v = 0; v < V; v++)
      for (let a = 0; a < 3; a++) {
        const src = (t * V + v) * 3 + a;
        const dst = (k * V + v) * 3 + a;
        positions[dst] = (c[a] ?? 0) + ((m.positions[src] ?? 0) - (c[a] ?? 0)) * scale;
        normals[dst] = m.normals[src] ?? 0;
        colors[dst] = m.colors[src] ?? 0;
      }
    uvs.set(m.uvs.subarray(t * V * 2, (t + 1) * V * 2), k * V * 2);
    for (let i = 0; i < TUFT.tris * 3; i++)
      indices[k * TUFT.tris * 3 + i] = (m.indices[t * TUFT.tris * 3 + i] ?? 0) - t * V + k * V;
  }
  return { ...m, positions, normals, colors, uvs, indices };
}
