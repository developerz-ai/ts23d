// Topology of an imported triangle soup: vertices welded by quantised position into points (UV and
// normal seams stay separate vertices but share a point), then edge-connected shells, each made
// consistently wound by a breadth-first walk (a neighbour across a manifold edge must traverse it
// the other way) and measured: closed or not, signed volume. Index order throughout.

import type { Mesh } from '../core/index.ts';

/** Point id per vertex: positions equal on a grid of `rel` × the bounding-box diagonal. */
export function pointsOf(m: Mesh, rel: number): Int32Array {
  const P = m.positions;
  const n = P.length / 3;
  let lo = [Infinity, Infinity, Infinity];
  let hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++)
    for (let k = 0; k < 3; k++) {
      const v = P[i * 3 + k] ?? 0;
      lo[k] = Math.min(lo[k] ?? 0, v);
      hi[k] = Math.max(hi[k] ?? 0, v);
    }
  if (n === 0) {
    lo = [0, 0, 0];
    hi = [0, 0, 0];
  }
  const diag = Math.hypot(
    (hi[0] ?? 0) - (lo[0] ?? 0),
    (hi[1] ?? 0) - (lo[1] ?? 0),
    (hi[2] ?? 0) - (lo[2] ?? 0),
  );
  const q = Math.max(diag * rel, 1e-12);
  const ids = new Map<string, number>();
  const out = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const key = `${Math.round((P[i * 3] ?? 0) / q)},${Math.round((P[i * 3 + 1] ?? 0) / q)},${Math.round((P[i * 3 + 2] ?? 0) / q)}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = ids.size;
      ids.set(key, id);
    }
    out[i] = id;
  }
  return out;
}

export interface Shell {
  readonly faces: readonly number[];
  readonly closed: boolean;
  readonly volume: number;
}

/** Undirected point edge → faces using it, in face order. */
export function edgeFaces(idx: Uint32Array, pt: Int32Array): Map<number, number[]> {
  const span = pt.reduce((a, b) => Math.max(a, b), 0) + 1;
  const map = new Map<number, number[]>();
  for (let f = 0; f < idx.length / 3; f++)
    for (let k = 0; k < 3; k++) {
      const a = pt[idx[f * 3 + k] ?? 0] ?? 0;
      const b = pt[idx[f * 3 + ((k + 1) % 3)] ?? 0] ?? 0;
      const key = Math.min(a, b) * span + Math.max(a, b);
      const l = map.get(key);
      if (l) l.push(f);
      else map.set(key, [f]);
    }
  return map;
}

/** Shells with winding made consistent IN PLACE on `idx`; `turned[f]` = 1 where f was flipped. */
export function shellsOf(
  P: Float32Array,
  idx: Uint32Array,
  pt: Int32Array,
): { shells: Shell[]; turned: Uint8Array } {
  const span = pt.reduce((a, b) => Math.max(a, b), 0) + 1;
  const edges = edgeFaces(idx, pt);
  const nf = idx.length / 3;
  const shellOf = new Int32Array(nf).fill(-1);
  const shells: Shell[] = [];
  const turned = new Uint8Array(nf);
  const pts = (f: number): [number, number, number] => [
    pt[idx[f * 3] ?? 0] ?? 0,
    pt[idx[f * 3 + 1] ?? 0] ?? 0,
    pt[idx[f * 3 + 2] ?? 0] ?? 0,
  ];
  const has = (f: number, a: number, b: number): boolean => {
    const p = pts(f);
    return (p[0] === a && p[1] === b) || (p[1] === a && p[2] === b) || (p[2] === a && p[0] === b);
  };
  for (let seed = 0; seed < nf; seed++) {
    if (shellOf[seed] !== -1) continue;
    const id = shells.length;
    const faces: number[] = [];
    const queue = [seed];
    shellOf[seed] = id;
    let closed = true;
    for (let qi = 0; qi < queue.length; qi++) {
      const f = queue[qi] ?? 0;
      faces.push(f);
      const p = pts(f);
      for (let k = 0; k < 3; k++) {
        const a = p[k] ?? 0;
        const b = p[(k + 1) % 3] ?? 0;
        const list = edges.get(Math.min(a, b) * span + Math.max(a, b)) ?? [];
        if (list.length !== 2) closed = false;
        for (const g of list) {
          if (g === f || shellOf[g] !== -1) continue;
          shellOf[g] = id;
          // Manifold edge: the neighbour must run b → a. Same direction → turn it over.
          if (list.length === 2 && has(g, a, b)) {
            const t = idx[g * 3 + 1] ?? 0;
            idx[g * 3 + 1] = idx[g * 3 + 2] ?? 0;
            idx[g * 3 + 2] = t;
            turned[g] = 1;
          }
          queue.push(g);
        }
      }
    }
    faces.sort((x, y) => x - y);
    let volume = 0;
    for (const f of faces) {
      const [a, b, c] = [idx[f * 3] ?? 0, idx[f * 3 + 1] ?? 0, idx[f * 3 + 2] ?? 0];
      const ax = P[a * 3] ?? 0;
      const ay = P[a * 3 + 1] ?? 0;
      const az = P[a * 3 + 2] ?? 0;
      const bx = P[b * 3] ?? 0;
      const by = P[b * 3 + 1] ?? 0;
      const bz = P[b * 3 + 2] ?? 0;
      const cx = P[c * 3] ?? 0;
      const cy = P[c * 3 + 1] ?? 0;
      const cz = P[c * 3 + 2] ?? 0;
      volume +=
        (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    }
    shells.push({ faces, closed, volume });
  }
  return { shells, turned };
}
