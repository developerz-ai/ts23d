// What weathering reads off geometry, once per target: vertices welded into position groups (split
// hard-edge vertices share one), group adjacency, per-vertex area, signed convexity (edges vs
// cavities), connected pieces, and the ground. Sky exposure is separate (weather-exposure.ts).

import type { Mesh } from '../core/index.ts';

export interface Surface {
  readonly mesh: Mesh;
  readonly vertices: number;
  /** Vertex → position group. */
  readonly group: Uint32Array;
  readonly groups: number;
  /** Group positions (x, y, z). */
  readonly gp: Float64Array;
  /** Group → neighbour groups (CSR). */
  readonly nbrStart: Uint32Array;
  readonly nbr: Uint32Array;
  /** Vertex area: a third of each incident triangle, m². */
  readonly area: Float64Array;
  /** Per group: mean slope of neighbours against the averaged normal; < 0 convex, > 0 cavity. */
  readonly convex: Float32Array;
  /** Group → connected piece (welded connectivity). */
  readonly piece: Uint32Array;
  readonly pieces: number;
  readonly minZ: number;
  readonly maxZ: number;
}

const Q = 1e4;

function weld(m: Mesh): { group: Uint32Array; gp: Float64Array; groups: number } {
  const n = m.positions.length / 3;
  const group = new Uint32Array(n);
  const ids = new Map<string, number>();
  const gp: number[] = [];
  for (let v = 0; v < n; v++) {
    const x = m.positions[v * 3] ?? 0;
    const y = m.positions[v * 3 + 1] ?? 0;
    const z = m.positions[v * 3 + 2] ?? 0;
    const key = `${Math.round(x * Q)},${Math.round(y * Q)},${Math.round(z * Q)}`;
    let g = ids.get(key);
    if (g === undefined) {
      g = gp.length / 3;
      ids.set(key, g);
      gp.push(x, y, z);
    }
    group[v] = g;
  }
  return { group, gp: Float64Array.from(gp), groups: gp.length / 3 };
}

function adjacency(m: Mesh, group: Uint32Array, groups: number): [Uint32Array, Uint32Array] {
  const pairs: number[] = [];
  for (let t = 0; t < m.indices.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = group[m.indices[t + e] ?? 0] ?? 0;
      const b = group[m.indices[t + ((e + 1) % 3)] ?? 0] ?? 0;
      if (a !== b) pairs.push(a * groups + b, b * groups + a);
    }
  }
  const sorted = Float64Array.from(pairs).sort();
  const start = new Uint32Array(groups + 1);
  const list: number[] = [];
  let prev = -1;
  for (const k of sorted) {
    if (k === prev) continue;
    prev = k;
    const a = Math.floor(k / groups);
    list.push(k - a * groups);
    start[a + 1] = (start[a + 1] ?? 0) + 1;
  }
  for (let g = 0; g < groups; g++) start[g + 1] = (start[g + 1] ?? 0) + (start[g] ?? 0);
  return [start, Uint32Array.from(list)];
}

function areas(m: Mesh): Float64Array {
  const P = m.positions;
  const out = new Float64Array(P.length / 3);
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = m.indices[t] ?? 0;
    const b = m.indices[t + 1] ?? 0;
    const c = m.indices[t + 2] ?? 0;
    const e = (i: number, k: number): number => (P[i * 3 + k] ?? 0) - (P[a * 3 + k] ?? 0);
    const cx = e(b, 1) * e(c, 2) - e(b, 2) * e(c, 1);
    const cy = e(b, 2) * e(c, 0) - e(b, 0) * e(c, 2);
    const cz = e(b, 0) * e(c, 1) - e(b, 1) * e(c, 0);
    const third = Math.hypot(cx, cy, cz) / 6;
    out[a] = (out[a] ?? 0) + third;
    out[b] = (out[b] ?? 0) + third;
    out[c] = (out[c] ?? 0) + third;
  }
  return out;
}

export function analyse(mesh: Mesh): Surface {
  const { group, gp, groups } = weld(mesh);
  const [nbrStart, nbr] = adjacency(mesh, group, groups);
  // Averaged group normal (every split vertex's normal counts once).
  const gn = new Float64Array(groups * 3);
  for (let v = 0; v < group.length; v++) {
    const g = group[v] ?? 0;
    for (let k = 0; k < 3; k++)
      gn[g * 3 + k] = (gn[g * 3 + k] ?? 0) + (mesh.normals[v * 3 + k] ?? 0);
  }
  const convex = new Float32Array(groups);
  for (let g = 0; g < groups; g++) {
    const l = Math.hypot(gn[g * 3] ?? 0, gn[g * 3 + 1] ?? 0, gn[g * 3 + 2] ?? 0) || 1;
    let sum = 0;
    const s = nbrStart[g] ?? 0;
    const e = nbrStart[g + 1] ?? 0;
    for (let i = s; i < e; i++) {
      const q = nbr[i] ?? 0;
      let d = 0;
      let len = 0;
      for (let k = 0; k < 3; k++) {
        const dk = (gp[q * 3 + k] ?? 0) - (gp[g * 3 + k] ?? 0);
        d += dk * ((gn[g * 3 + k] ?? 0) / l);
        len += dk * dk;
      }
      sum += d / (Math.sqrt(len) || 1);
    }
    convex[g] = e > s ? sum / (e - s) : 0;
  }
  // Pieces: flood fill over welded adjacency, in group order (deterministic ids).
  const piece = new Uint32Array(groups).fill(0xffffffff);
  let pieces = 0;
  const stack: number[] = [];
  for (let g = 0; g < groups; g++) {
    if (piece[g] !== 0xffffffff) continue;
    piece[g] = pieces;
    stack.push(g);
    while (stack.length) {
      const c = stack.pop() ?? 0;
      for (let i = nbrStart[c] ?? 0; i < (nbrStart[c + 1] ?? 0); i++) {
        const q = nbr[i] ?? 0;
        if (piece[q] === 0xffffffff) {
          piece[q] = pieces;
          stack.push(q);
        }
      }
    }
    pieces++;
  }
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let g = 0; g < groups; g++) {
    const z = gp[g * 3 + 2] ?? 0;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return {
    mesh,
    vertices: group.length,
    group,
    groups,
    gp,
    nbrStart,
    nbr,
    area: areas(mesh),
    convex,
    piece,
    pieces,
    minZ: Number.isFinite(minZ) ? minZ : 0,
    maxZ: Number.isFinite(maxZ) ? maxZ : 0,
  };
}

/** Axis-aligned bounds of each piece: [minx, miny, minz, maxx, maxy, maxz] × pieces. */
export function pieceBounds(s: Surface): Float64Array {
  const b = new Float64Array(s.pieces * 6);
  for (let i = 0; i < s.pieces; i++)
    b.set([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], i * 6);
  for (let g = 0; g < s.groups; g++) {
    const p = s.piece[g] ?? 0;
    for (let k = 0; k < 3; k++) {
      const v = s.gp[g * 3 + k] ?? 0;
      if (v < (b[p * 6 + k] ?? 0)) b[p * 6 + k] = v;
      if (v > (b[p * 6 + 3 + k] ?? 0)) b[p * 6 + 3 + k] = v;
    }
  }
  return b;
}
