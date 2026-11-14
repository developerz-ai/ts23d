// Skinning for hull-like surfaces: a station × column grid of points becomes quads with smooth
// normals (central differences; collapsed rows such as a stem head borrow their neighbour's), and
// any column range can be emitted as its own colour band, mirrored to port for a symmetric hull.
// Collapsed rows and columns (the stem head, bottom columns where the keel rises above the
// waterline) keep only the half of each quad that has area: no zero-area slivers.

import type { MeshBuilder, Vec3 } from '../core/index.ts';
import { stripRect } from '../material/index.ts';

export type Grid = Vec3[][];
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Twice the area of triangle a-b-c. */
const area2 = (a: Vec3, b: Vec3, c: Vec3): number => Math.hypot(...cross3(sub3(b, a), sub3(c, a)));

/** Quad a-b-c-d (ids and positions) as its two triangles, each only if it has area. */
export function skinQuad(
  b: MeshBuilder,
  ids: readonly [number, number, number, number],
  p: readonly [Vec3, Vec3, Vec3, Vec3],
): void {
  if (area2(p[0], p[1], p[2]) > 1e-12) b.tri(ids[0], ids[1], ids[2]);
  if (area2(p[0], p[2], p[3]) > 1e-12) b.tri(ids[0], ids[2], ids[3]);
}

/** Smooth normals over a station × column grid (outward = tj × ti for the starboard side). */
export function normalsOf(g: Grid): Grid {
  const R = g.length;
  const out: Grid = g.map((row, i) =>
    row.map((p, j) => {
      const r = (k: number): Vec3[] => g[Math.max(0, Math.min(R - 1, k))] ?? row;
      const ti = sub3(r(i + 1)[j] ?? p, r(i - 1)[j] ?? p);
      const tj = sub3(row[Math.min(row.length - 1, j + 1)] ?? p, row[Math.max(0, j - 1)] ?? p);
      const n = cross3(tj, ti);
      const l = Math.hypot(...n);
      return l < 1e-9 ? ([0, 0, 0] as Vec3) : ([n[0] / l, n[1] / l, n[2] / l] as Vec3);
    }),
  );
  // Collapsed rows (stem head, round stern post) borrow the nearest row's normals.
  for (let i = 0; i < R; i++) {
    const row = out[i] ?? [];
    row.forEach((n, j) => {
      if (n[0] || n[1] || n[2]) return;
      for (let d = 1; d < R; d++) {
        const m = out[i - d]?.[j] ?? out[i + d]?.[j];
        if (m && (m[0] || m[1] || m[2])) {
          row[j] = m;
          return;
        }
      }
    });
  }
  return out;
}

/** Emit columns [j0, j1] of a starboard grid and its port mirror. */
export function emitBand(
  b: MeshBuilder,
  g: Grid,
  nrm: Grid,
  j0: number,
  j1: number,
  color: Vec3,
  mirror: boolean,
): void {
  const rect = stripRect('plain');
  for (const side of mirror ? [1, -1] : [1]) {
    const ids = g.map((row, i) =>
      row.slice(j0, j1 + 1).map((p, k) => {
        const n = nrm[i]?.[j0 + k] ?? [0, 0, 1];
        return b.vertex({
          p: [p[0], p[1] * side, p[2]],
          n: [n[0], n[1] * side, n[2]],
          uv: [
            rect.u0 + p[0] / rect.metres,
            rect.v0 + (k / Math.max(1, j1 - j0)) * (rect.v1 - rect.v0),
          ],
          color,
        });
      }),
    );
    const at = (i: number, k: number): Vec3 => {
      const p = g[i]?.[j0 + k] ?? [0, 0, 0];
      return [p[0], p[1] * side, p[2]];
    };
    for (let i = 0; i + 1 < ids.length; i++) {
      for (let k = 0; k < j1 - j0; k++) {
        const a = ids[i]?.[k] ?? 0;
        const c = ids[i]?.[k + 1] ?? 0;
        const e = ids[i + 1]?.[k + 1] ?? 0;
        const d = ids[i + 1]?.[k] ?? 0;
        const [pa, pc, pe, pd] = [at(i, k), at(i, k + 1), at(i + 1, k + 1), at(i + 1, k)];
        if (side > 0) skinQuad(b, [a, c, e, d], [pa, pc, pe, pd]);
        else skinQuad(b, [a, d, e, c], [pa, pd, pe, pc]);
      }
    }
  }
}
