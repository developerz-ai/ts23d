// Closed-surface checks for primitives that claim watertight output (bevelled box, sdf). Weld by
// position (flat faces own their vertices); a surface is closed and consistently wound when every
// edge is walked as often a→b as b→a. Non-manifold edges (surface nets on sub-cell features) are
// counted separately. Internal; tests use them.

import type { Mesh } from '../core/index.ts';

/** Undirected edges walked a different number of times a→b than b→a (0 = closed, oriented). */
export function openEdges(m: Mesh): number {
  const key = (i: number): string =>
    `${Math.round((m.positions[i * 3] ?? 0) * 1e4)},${Math.round((m.positions[i * 3 + 1] ?? 0) * 1e4)},${Math.round((m.positions[i * 3 + 2] ?? 0) * 1e4)}`;
  const edges = new Map<string, number>();
  for (let t = 0; t < m.indices.length; t += 3) {
    for (let j = 0; j < 3; j++) {
      const a = key(m.indices[t + j] ?? 0);
      const b = key(m.indices[t + ((j + 1) % 3)] ?? 0);
      if (a !== b) edges.set(`${a}>${b}`, (edges.get(`${a}>${b}`) ?? 0) + 1);
    }
  }
  let open = 0;
  for (const [e, n] of edges) {
    const [a, b] = e.split('>');
    if (edges.get(`${b}>${a}`) !== n) open++;
  }
  return open;
}

/** Directed edges used more than once: 0 = 2-manifold (given openEdges = 0). */
export function nonManifoldEdges(m: Mesh): number {
  const key = (i: number): string =>
    `${Math.round((m.positions[i * 3] ?? 0) * 1e4)},${Math.round((m.positions[i * 3 + 1] ?? 0) * 1e4)},${Math.round((m.positions[i * 3 + 2] ?? 0) * 1e4)}`;
  const seen = new Map<string, number>();
  for (let t = 0; t < m.indices.length; t += 3)
    for (let j = 0; j < 3; j++) {
      const e = `${key(m.indices[t + j] ?? 0)}>${key(m.indices[t + ((j + 1) % 3)] ?? 0)}`;
      seen.set(e, (seen.get(e) ?? 0) + 1);
    }
  let bad = 0;
  for (const n of seen.values()) if (n > 1) bad++;
  return bad;
}

/**
 * Triangles whose winding (b − a) × (c − a) clearly disagrees with their mean vertex normal
 * (cosine < −0.1; inside-out scores ≈ −1). Slivers whose face normal lies in the surface
 * (cosine ≈ 0, e.g. surface nets at sub-cell features) are orientation-ambiguous, not counted.
 */
export function windingFlips(m: Mesh): number {
  let bad = 0;
  const P = m.positions;
  const N = m.normals;
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = (m.indices[t] ?? 0) * 3;
    const b = (m.indices[t + 1] ?? 0) * 3;
    const c = (m.indices[t + 2] ?? 0) * 3;
    const e = [0, 1, 2].map((k) => (P[b + k] ?? 0) - (P[a + k] ?? 0));
    const f = [0, 1, 2].map((k) => (P[c + k] ?? 0) - (P[a + k] ?? 0));
    const g = [
      (e[1] ?? 0) * (f[2] ?? 0) - (e[2] ?? 0) * (f[1] ?? 0),
      (e[2] ?? 0) * (f[0] ?? 0) - (e[0] ?? 0) * (f[2] ?? 0),
      (e[0] ?? 0) * (f[1] ?? 0) - (e[1] ?? 0) * (f[0] ?? 0),
    ];
    let s = 0;
    let nn = 0;
    for (let k = 0; k < 3; k++) {
      const m = (N[a + k] ?? 0) + (N[b + k] ?? 0) + (N[c + k] ?? 0);
      s += (g[k] ?? 0) * m;
      nn += m * m;
    }
    const gl = Math.hypot(g[0] ?? 0, g[1] ?? 0, g[2] ?? 0);
    if (gl > 0 && nn > 0 && s / (gl * Math.sqrt(nn)) < -0.1) bad++;
  }
  return bad;
}
