// The connectivity `simplify` collapses over: wedges (vertices with all attributes) welded
// exactly, points (wedges sharing a position), per-point incident faces, and a kind per point —
// manifold, border (on an open edge), seam (on a UV/normal/colour discontinuity) or locked
// (non-manifold, a seam/border corner) — from which edges a point may slide along.

import type { Mesh } from '../core/index.ts';

export const MANIFOLD = 0;
export const BORDER = 1;
export const SEAM = 2;
export const LOCKED = 3;

export interface Topology {
  /** Point of each wedge. */
  readonly pt: Int32Array;
  /** Position per point. */
  readonly pos: Float64Array;
  /** Faces as wedge triples (mutable during collapse). */
  readonly tri: Int32Array;
  /** Faces per point (may hold dead faces; filter by `alive`). */
  readonly inc: number[][];
  readonly kind: Uint8Array;
  /** Undirected point edges (key a·n + b, a < b) that are borders or seams. */
  readonly special: Set<number>;
  readonly points: number;
}

const key = (a: number, b: number, n: number): number => Math.min(a, b) * n + Math.max(a, b);
export const edgeKey = key;

export function topology(m: Mesh, preserveSeams: boolean): Topology {
  const nv = m.positions.length / 3;
  // Wedges: identical attributes → one id (first occurrence).
  const wedgeOf = new Int32Array(nv);
  const wedgeIds = new Map<string, number>();
  const ptIds = new Map<string, number>();
  const pt = new Int32Array(nv);
  const posList: number[] = [];
  const r = (v: number): string => (Math.round(v * 1e6) / 1e6).toString();
  for (let i = 0; i < nv; i++) {
    const p = `${r(m.positions[i * 3] ?? 0)},${r(m.positions[i * 3 + 1] ?? 0)},${r(m.positions[i * 3 + 2] ?? 0)}`;
    let id = ptIds.get(p);
    if (id === undefined) {
      id = ptIds.size;
      ptIds.set(p, id);
      posList.push(
        m.positions[i * 3] ?? 0,
        m.positions[i * 3 + 1] ?? 0,
        m.positions[i * 3 + 2] ?? 0,
      );
    }
    pt[i] = id;
    const a = [
      p,
      r(m.normals[i * 3] ?? 0),
      r(m.normals[i * 3 + 1] ?? 0),
      r(m.normals[i * 3 + 2] ?? 0),
      r(m.uvs[i * 2] ?? 0),
      r(m.uvs[i * 2 + 1] ?? 0),
      r(m.colors[i * 3] ?? 0),
      r(m.colors[i * 3 + 1] ?? 0),
      r(m.colors[i * 3 + 2] ?? 0),
    ].join('|');
    let w = wedgeIds.get(a);
    if (w === undefined) {
      w = i;
      wedgeIds.set(a, i);
    }
    wedgeOf[i] = w;
  }
  const n = ptIds.size;
  const nf = m.indices.length / 3;
  const tri = new Int32Array(nf * 3);
  for (let i = 0; i < nf * 3; i++) tri[i] = wedgeOf[m.indices[i] ?? 0] ?? 0;
  const inc: number[][] = Array.from({ length: n }, () => []);
  const edges = new Map<number, number[]>();
  for (let f = 0; f < nf; f++)
    for (let k = 0; k < 3; k++) {
      const a = pt[tri[f * 3 + k] ?? 0] ?? 0;
      const b = pt[tri[f * 3 + ((k + 1) % 3)] ?? 0] ?? 0;
      inc[a]?.push(f);
      const e = key(a, b, n);
      const l = edges.get(e);
      if (l) l.push(f);
      else edges.set(e, [f]);
    }
  const kind = new Uint8Array(n);
  const borderCount = new Int32Array(n);
  const seamCount = new Int32Array(n);
  const special = new Set<number>();
  const wedgeAt = (f: number, p: number): number => {
    for (let k = 0; k < 3; k++) if (pt[tri[f * 3 + k] ?? 0] === p) return tri[f * 3 + k] ?? -1;
    return -1;
  };
  for (const [e, faces] of edges) {
    const a = Math.floor(e / n);
    const b = e - a * n;
    if (faces.length > 2) {
      kind[a] = LOCKED;
      kind[b] = LOCKED;
      continue;
    }
    if (faces.length === 1) {
      special.add(e);
      for (const p of [a, b]) borderCount[p] = (borderCount[p] ?? 0) + 1;
      continue;
    }
    const [f, g] = faces as [number, number];
    if (wedgeAt(f, a) !== wedgeAt(g, a) || wedgeAt(f, b) !== wedgeAt(g, b)) {
      if (!preserveSeams) continue;
      special.add(e);
      for (const p of [a, b]) seamCount[p] = (seamCount[p] ?? 0) + 1;
    }
  }
  for (let p = 0; p < n; p++) {
    if (kind[p] === LOCKED) continue;
    const bc = borderCount[p] ?? 0;
    const sc = seamCount[p] ?? 0;
    if (bc && sc) kind[p] = LOCKED;
    else if (bc) kind[p] = bc === 2 ? BORDER : LOCKED;
    else if (sc) kind[p] = sc === 2 ? SEAM : LOCKED;
  }
  return { pt, pos: Float64Array.from(posList), tri, inc, kind, special, points: n };
}
