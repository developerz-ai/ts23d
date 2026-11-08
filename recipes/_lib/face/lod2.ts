// LOD2 skin: the cut skin re-meshed through its distance field at a coarse cell (as the sculpted
// busts mesh their far LOD), with the eye sockets and mouth filled first (a 1 cm cell would open
// them into holes) and crumbs from sub-cell features (ear rims) dropped — only shells holding
// ≥ 3 % of the triangles are kept.

import { type Mesh, MeshBuilder, sdf, type Vec3 } from '@developerz.ai/ts23d';
import { meshField } from './mesh-field.ts';

export interface Fill {
  readonly at: Vec3;
  /** Ellipsoid radii. */
  readonly r: Vec3;
}

/** Drop shells smaller than `share` of the triangles (vertices welded by position). */
export function keepLarge(m: Mesh, share: number): Mesh {
  const P = m.positions;
  const V = P.length / 3;
  const key = new Map<string, number>();
  const rep = new Int32Array(V);
  for (let v = 0; v < V; v++) {
    const k = `${Math.round((P[v * 3] ?? 0) * 1e5)},${Math.round((P[v * 3 + 1] ?? 0) * 1e5)},${Math.round((P[v * 3 + 2] ?? 0) * 1e5)}`;
    const hit = key.get(k);
    if (hit === undefined) key.set(k, v);
    rep[v] = hit ?? v;
  }
  const parent = Int32Array.from({ length: V }, (_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while ((parent[r] ?? r) !== r) r = parent[r] ?? r;
    let y = x;
    while ((parent[y] ?? y) !== r) {
      const n = parent[y] ?? y;
      parent[y] = r;
      y = n;
    }
    return r;
  };
  const T = m.indices;
  for (let t = 0; t < T.length; t += 3) {
    const a = find(rep[T[t] ?? 0] ?? 0);
    const b = find(rep[T[t + 1] ?? 0] ?? 0);
    const c = find(rep[T[t + 2] ?? 0] ?? 0);
    parent[b] = a;
    parent[find(c)] = a;
  }
  const size = new Map<number, number>();
  for (let t = 0; t < T.length; t += 3) {
    const r = find(rep[T[t] ?? 0] ?? 0);
    size.set(r, (size.get(r) ?? 0) + 1);
  }
  const min = (T.length / 3) * share;
  const b = new MeshBuilder();
  const map = new Map<number, number>();
  const vtx = (v: number): number => {
    const hit = map.get(v);
    if (hit !== undefined) return hit;
    const i = b.vertex({
      p: [P[v * 3] ?? 0, P[v * 3 + 1] ?? 0, P[v * 3 + 2] ?? 0],
      n: [m.normals[v * 3] ?? 0, m.normals[v * 3 + 1] ?? 0, m.normals[v * 3 + 2] ?? 1],
      uv: [m.uvs[v * 2] ?? 0, m.uvs[v * 2 + 1] ?? 0],
      color: [m.colors[v * 3] ?? 0, m.colors[v * 3 + 1] ?? 0, m.colors[v * 3 + 2] ?? 0],
    });
    map.set(v, i);
    return i;
  };
  for (let t = 0; t < T.length; t += 3)
    if ((size.get(find(rep[T[t] ?? 0] ?? 0)) ?? 0) >= min)
      b.tri(vtx(T[t] ?? 0), vtx(T[t + 1] ?? 0), vtx(T[t + 2] ?? 0));
  return b.build();
}

/** The coarse skin: distance field of `m` united with the `fills`, cut flat at z = `floor`,
 *  meshed at `cell`. */
export function coarseSkin(
  m: Mesh,
  cell: number,
  fills: readonly Fill[],
  skin: Vec3,
  floor: number,
): Mesh {
  const f = meshField(m, cell * 0.5, 3);
  const [lo, hi] = f.bounds;
  const field = (p: Vec3): number => {
    let d = f.field(p);
    for (const e of fills) {
      const q = Math.hypot(
        (p[0] - e.at[0]) / e.r[0],
        (p[1] - e.at[1]) / e.r[1],
        (p[2] - e.at[2]) / e.r[2],
      );
      d = Math.min(d, (q - 1) * Math.min(e.r[0], e.r[1], e.r[2]));
    }
    // The chest cut stays a clean plane (the coarse field frays at the cap's rim).
    return Math.max(d, floor - p[2]);
  };
  const raw = sdf({
    field,
    bounds: [
      [lo[0] - cell, lo[1] - cell, lo[2] - cell],
      [hi[0] + cell, hi[1] + cell, hi[2] + cell],
    ],
    resolution: cell,
    color: (p) => (f.field(p) > cell * 0.3 ? skin : f.colorAt(p)),
    strip: 'plain',
  });
  return keepLarge(raw, 0.03);
}
