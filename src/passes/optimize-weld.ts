// Vertex weld + degenerate/duplicate triangle removal: the "index" step of mesh optimisation.
// Two vertices merge when position, normal, UV and colour all quantise to the same cell, so hard
// edges (split normals) and UV seams survive. First occurrence wins; output order is the order of
// first appearance — deterministic, no hashing of floats into iteration order.

import type { Mesh } from '../core/index.ts';

export interface WeldTolerance {
  /** Position grid, metres. */
  readonly position: number;
  readonly normal: number;
  readonly uv: number;
  readonly color: number;
}

export const DEFAULT_WELD: WeldTolerance = {
  position: 1e-5,
  normal: 1e-3,
  uv: 1e-5,
  // Below the GLB's unorm16 colour step: welding never changes exported colour.
  color: 1 / 131072,
};

export interface Welded {
  readonly mesh: Mesh;
  readonly degenerate: number;
  readonly duplicate: number;
}

/** The quantised attribute tuple of vertex i (12 ints). */
function cellOf(m: Mesh, i: number, t: WeldTolerance, out: Int32Array): void {
  for (let k = 0; k < 3; k++) {
    out[k] = Math.round((m.positions[i * 3 + k] ?? 0) / t.position);
    out[3 + k] = Math.round((m.normals[i * 3 + k] ?? 0) / t.normal);
    out[8 + k] = Math.round((m.colors[i * 3 + k] ?? 0) / t.color);
  }
  out[6] = Math.round((m.uvs[i * 2] ?? 0) / t.uv);
  out[7] = Math.round((m.uvs[i * 2 + 1] ?? 0) / t.uv);
  out[11] = 0;
}

const hashCell = (c: Int32Array): number => {
  let h = 2166136261;
  for (let k = 0; k < 11; k++) h = Math.imul(h ^ (c[k] ?? 0), 16777619);
  return h >>> 0;
};

/** Map each input vertex to its welded representative (open-addressing table, linear probe). */
function weldMap(m: Mesh, t: WeldTolerance): { remap: Uint32Array; keep: number[] } {
  const n = m.positions.length / 3;
  const cells = new Int32Array(n * 12);
  const remap = new Uint32Array(n);
  const keep: number[] = [];
  let cap = 16;
  while (cap < n * 2) cap *= 2;
  const table = new Int32Array(cap).fill(-1);
  const cur = new Int32Array(12);
  for (let i = 0; i < n; i++) {
    cellOf(m, i, t, cur);
    cells.set(cur, i * 12);
    let slot = hashCell(cur) & (cap - 1);
    let found = -1;
    for (;;) {
      const j = table[slot] ?? -1;
      if (j < 0) break;
      const rep = (keep[j] ?? 0) * 12;
      let same = true;
      for (let k = 0; k < 11 && same; k++) same = cells[rep + k] === cur[k];
      if (same) {
        found = j;
        break;
      }
      slot = (slot + 1) & (cap - 1);
    }
    if (found < 0) {
      found = keep.length;
      keep.push(i);
      table[slot] = found;
    }
    remap[i] = found;
  }
  return { remap, keep };
}

/** Twice the triangle's area, from welded positions. */
function area2(p: Float32Array, a: number, b: number, c: number): number {
  const ax = p[a * 3] ?? 0;
  const ay = p[a * 3 + 1] ?? 0;
  const az = p[a * 3 + 2] ?? 0;
  const ux = (p[b * 3] ?? 0) - ax;
  const uy = (p[b * 3 + 1] ?? 0) - ay;
  const uz = (p[b * 3 + 2] ?? 0) - az;
  const vx = (p[c * 3] ?? 0) - ax;
  const vy = (p[c * 3 + 1] ?? 0) - ay;
  const vz = (p[c * 3 + 2] ?? 0) - az;
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}

export function weld(m: Mesh, t: WeldTolerance = DEFAULT_WELD): Welded {
  const { remap, keep } = weldMap(m, t);
  const pick = (src: Float32Array, w: number): Float32Array => {
    const out = new Float32Array(keep.length * w);
    keep.forEach((i, j) => {
      for (let k = 0; k < w; k++) out[j * w + k] = src[i * w + k] ?? 0;
    });
    return out;
  };
  const positions = pick(m.positions, 3);
  const idx: number[] = [];
  // Duplicate detection: canonical rotation (lowest index first) hashed to a numeric key.
  const seen = new Map<number, number[]>();
  let degenerate = 0;
  let duplicate = 0;
  for (let f = 0; f < m.indices.length; f += 3) {
    const a = remap[m.indices[f] ?? 0] ?? 0;
    const b = remap[m.indices[f + 1] ?? 0] ?? 0;
    const c = remap[m.indices[f + 2] ?? 0] ?? 0;
    // Zero area covers no pixel: dropping it cannot open a crack.
    if (a === b || b === c || a === c || area2(positions, a, b, c) < 1e-12) {
      degenerate++;
      continue;
    }
    // Same triangle, same winding (any rotation) is pure overdraw; the reverse winding is a
    // deliberate double-sided face and stays.
    const [x, y, z] = a < b && a < c ? [a, b, c] : b < c ? [b, c, a] : [c, a, b];
    const h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0;
    const list = seen.get(h);
    if (list?.some((at) => idx[at] === x && idx[at + 1] === y && idx[at + 2] === z)) {
      duplicate++;
      continue;
    }
    if (list) list.push(idx.length);
    else seen.set(h, [idx.length]);
    idx.push(x, y, z);
  }
  return {
    mesh: {
      positions,
      normals: pick(m.normals, 3),
      uvs: pick(m.uvs, 2),
      colors: pick(m.colors, 3),
      indices: new Uint32Array(idx),
    },
    degenerate,
    duplicate,
  };
}
