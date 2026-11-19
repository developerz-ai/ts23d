// Which atlas rows a mesh samples, from its V coordinates. Primitives put vertices exactly on a
// row's top edge (`rect.v1`), which is the next row's `v0`: a test of one V against a row's range
// then blames the neighbour too (a credit for a texture the asset never shows, a refused sheet).
// With `indices` the answer is exact: a triangle samples the row its mean V lies in. Without them
// it errs toward keeping a row: a V strictly inside a row counts for it, and a V on a shared edge
// for every row the mesh spans edge to edge (both edges present, as a box does). Two such edges
// may belong to the rows either side (lathes on rows 41 and 43 that reach 42 and 43), but a box
// on the row between looks the same, and a row wrongly dropped is a blank strip or a missing
// credit; a lone edge V still blames no neighbour. Callers with a mesh pass its indices.

import { STRIP_H } from './trim-sheet.ts';

/** Row indices (`v / STRIP_H`, floored) sampled by a mesh with one V per vertex in `vs`. */
export function rowsSampled(vs: ArrayLike<number>, indices?: ArrayLike<number>): Set<number> {
  const rows = new Set<number>();
  if (indices) {
    for (let t = 0; t + 2 < indices.length; t += 3) {
      const a = vs[indices[t] ?? 0] ?? 0;
      const b = vs[indices[t + 1] ?? 0] ?? 0;
      const c = vs[indices[t + 2] ?? 0] ?? 0;
      const row = (a + b + c) / 3 / STRIP_H;
      // A triangle lying wholly on a shared edge samples a single texel line: neither row's.
      if (!(a === b && b === c && Number.isInteger(row))) rows.add(Math.floor(row));
    }
    return rows;
  }
  const edges = new Set<number>();
  for (let i = 0; i < vs.length; i++) {
    const row = (vs[i] ?? 0) / STRIP_H;
    if (Number.isInteger(row)) edges.add(row);
    else rows.add(Math.floor(row));
  }
  for (const k of edges) if (edges.has(k + 1)) rows.add(k);
  return rows;
}
