// The face base: decodes the committed MakeHuman hm08 bust region (base/hm08-bust.ts, CC0) into a
// quad mesh — positions in metres (Z up, +X front) and quads as vertex-index quadruples — plus
// each vertex's mirror partner across y = 0, so warps and paint can stay symmetric on purpose.
// Decoded once per process and shared (callers copy before they move anything).

import { HM08_BUST } from './base/hm08-bust.ts';

export interface QuadMesh {
  /** xyz per vertex, metres. */
  readonly p: Float64Array;
  /** 4 vertex indices per quad, counter-clockwise seen from outside. */
  readonly q: Uint32Array;
}

function bytes(b64: string): DataView {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new DataView(u.buffer);
}

let cached: { mesh: QuadMesh; mirror: Uint32Array } | null = null;

function decode(): { mesh: QuadMesh; mirror: Uint32Array } {
  const B = HM08_BUST;
  const pv = bytes(B.positions);
  const iv = bytes(B.indices);
  const p = new Float64Array(B.vertices * 3);
  for (let i = 0; i < B.vertices * 3; i++) {
    const k = i % 3;
    const lo = B.lo[k] ?? 0;
    p[i] = lo + (pv.getUint16(i * 2, true) / 65535) * ((B.hi[k] ?? 0) - lo);
  }
  const q = new Uint32Array(B.quads * 4);
  for (let i = 0; i < q.length; i++) q[i] = iv.getUint16(i * 2, true);
  // Mirror partners: the nearest vertex to (x, −y, z), through a coarse hash grid.
  const key = (x: number, y: number, z: number): string =>
    `${Math.round(x * 500)},${Math.round(y * 500)},${Math.round(z * 500)}`;
  const grid = new Map<string, number[]>();
  for (let v = 0; v < B.vertices; v++) {
    const k = key(p[v * 3] ?? 0, p[v * 3 + 1] ?? 0, p[v * 3 + 2] ?? 0);
    const list = grid.get(k);
    if (list) list.push(v);
    else grid.set(k, [v]);
  }
  const mirror = new Uint32Array(B.vertices);
  for (let v = 0; v < B.vertices; v++) {
    const x = p[v * 3] ?? 0;
    const y = -(p[v * 3 + 1] ?? 0);
    const z = p[v * 3 + 2] ?? 0;
    let best = v;
    let bd = Number.POSITIVE_INFINITY;
    const [cx, cy, cz] = [Math.round(x * 500), Math.round(y * 500), Math.round(z * 500)];
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (let k = -1; k <= 1; k++)
          for (const u of grid.get(`${cx + i},${cy + j},${cz + k}`) ?? []) {
            const d = Math.hypot(
              (p[u * 3] ?? 0) - x,
              (p[u * 3 + 1] ?? 0) - y,
              (p[u * 3 + 2] ?? 0) - z,
            );
            if (d < bd) {
              bd = d;
              best = u;
            }
          }
    mirror[v] = best;
  }
  return { mesh: { p, q }, mirror };
}

/** The decoded base (shared — copy `p` before editing). */
export function faceBase(): { readonly mesh: QuadMesh; readonly mirror: Uint32Array } {
  cached ??= decode();
  return cached;
}

export const BASE_SOURCE = { url: HM08_BUST.url, sha256: HM08_BUST.sha256 } as const;
