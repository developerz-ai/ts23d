// Tessellate a mesh until no edge is longer than `maxEdge`, so vertex-colour weathering and dents
// have vertices to live on. Red-green refinement: every edge longer than the limit is split at its
// midpoint (shared through an edge table), triangles split 1→2, 1→3 or 1→4 by how many of their
// edges split. The split decision depends only on edge length, so co-located hard edges of two
// faces split identically: no cracks, no T-junctions. Attributes interpolate linearly.

import type { Mesh } from '../core/index.ts';

class Grow {
  p: number[];
  n: number[];
  uv: number[];
  c: number[];
  constructor(m: Mesh) {
    this.p = Array.from(m.positions);
    this.n = Array.from(m.normals);
    this.uv = Array.from(m.uvs);
    this.c = Array.from(m.colors);
  }
  get count(): number {
    return this.p.length / 3;
  }
  len2(a: number, b: number): number {
    const P = this.p;
    const dx = (P[a * 3] ?? 0) - (P[b * 3] ?? 0);
    const dy = (P[a * 3 + 1] ?? 0) - (P[b * 3 + 1] ?? 0);
    const dz = (P[a * 3 + 2] ?? 0) - (P[b * 3 + 2] ?? 0);
    return dx * dx + dy * dy + dz * dz;
  }
  mid(a: number, b: number): number {
    const lerp = (arr: number[], k: number): void => {
      for (let i = 0; i < k; i++) arr.push(((arr[a * k + i] ?? 0) + (arr[b * k + i] ?? 0)) / 2);
    };
    lerp(this.p, 3);
    lerp(this.uv, 2);
    lerp(this.c, 3);
    const nx = ((this.n[a * 3] ?? 0) + (this.n[b * 3] ?? 0)) / 2;
    const ny = ((this.n[a * 3 + 1] ?? 0) + (this.n[b * 3 + 1] ?? 0)) / 2;
    const nz = ((this.n[a * 3 + 2] ?? 0) + (this.n[b * 3 + 2] ?? 0)) / 2;
    const l = Math.hypot(nx, ny, nz) || 1;
    this.n.push(nx / l, ny / l, nz / l);
    return this.count - 1;
  }
}

/** One refinement round; returns the new index list, or null when nothing was too long. */
function round(g: Grow, idx: readonly number[], max2: number): number[] | null {
  const mids = new Map<number, number>();
  const stride = g.count + 1;
  const midOf = (a: number, b: number): number => {
    const key = a < b ? a * stride + b : b * stride + a;
    const hit = mids.get(key);
    if (hit !== undefined) return hit;
    const m = a < b ? g.mid(a, b) : g.mid(b, a);
    mids.set(key, m);
    return m;
  };
  let any = false;
  const out: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] ?? 0;
    const b = idx[t + 1] ?? 0;
    const c = idx[t + 2] ?? 0;
    const sab = g.len2(a, b) > max2;
    const sbc = g.len2(b, c) > max2;
    const sca = g.len2(c, a) > max2;
    const k = Number(sab) + Number(sbc) + Number(sca);
    if (k === 0) {
      out.push(a, b, c);
      continue;
    }
    any = true;
    if (k === 3) {
      const ab = midOf(a, b);
      const bc = midOf(b, c);
      const ca = midOf(c, a);
      out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
      continue;
    }
    // Rotate so the split edges start at `a`: one split = a-b; two = a-b and b-c.
    const rot =
      k === 1
        ? sab
          ? [a, b, c]
          : sbc
            ? [b, c, a]
            : [c, a, b]
        : !sca
          ? [a, b, c]
          : !sab
            ? [b, c, a]
            : [c, a, b];
    const [x, y, z] = rot as [number, number, number];
    const xy = midOf(x, y);
    if (k === 1) {
      out.push(x, xy, z, xy, y, z);
      continue;
    }
    const yz = midOf(y, z);
    out.push(xy, y, yz, x, xy, yz, x, yz, z);
  }
  return any ? out : null;
}

/** `mesh` with every edge ≤ `maxEdge` metres (at most `rounds` refinement rounds). */
export function subdivideTo(mesh: Mesh, maxEdge: number, rounds = 10): Mesh {
  if (!(maxEdge > 0)) return mesh;
  const g = new Grow(mesh);
  let idx: number[] = Array.from(mesh.indices);
  const max2 = maxEdge * maxEdge;
  for (let r = 0; r < rounds; r++) {
    const next = round(g, idx, max2);
    if (!next) break;
    idx = next;
  }
  return {
    positions: new Float32Array(g.p),
    normals: new Float32Array(g.n),
    uvs: new Float32Array(g.uv),
    colors: new Float32Array(g.c),
    indices: new Uint32Array(idx),
  };
}
