// Surface nets over a coarse grid with finer detail boxes (sdf-detail.ts), stitched into ONE
// closed surface — dual contouring on a two-level grid (Ju et al. 2002, minimal edges). Leaves are
// coarse cells outside the boxes and fine cells inside. Every sign-changing MINIMAL edge emits one
// polygon joining the leaves around it: fine edges inside and on a box (the box surface's coarse
// edges are replaced by their fine pieces), coarse edges everywhere else. Around an interface edge
// two fine-lattice slots fall in the same coarse leaf, so the quad loses a repeated corner and
// becomes the triangle that fills the transition ring. Interface samples are interpolated from the
// coarse corners, so every coarse leaf an interface edge needs has a vertex.

import { invalid } from './check.ts';
import type { DetailGrid } from './sdf-detail.ts';
import type { Grid } from './sdf-grid.ts';
import { cellOffset, quadEmitter, type RawSurface } from './surface-nets.ts';

export function surfaceNetsDetail(g: Grid, regions: readonly DetailGrid[]): RawSurface {
  const { nx, ny, nz, values: v, h, origin: o } = g;
  const cx = nx - 1;
  const cy = ny - 1;
  const cells = new Int32Array(cx * cy * (nz - 1)).fill(-1);
  // Coarse cells replaced by a box, and coarse points on or inside box i (stored as i + 1): an
  // edge with both ends in the same box is refined there, so it is not a minimal edge.
  const covered = new Uint8Array(cx * cy * (nz - 1));
  const closed = new Uint16Array(nx * ny * nz);
  regions.forEach((r, ri) => {
    for (let z = r.at[2]; z <= r.at[2] + r.cells[2]; z++)
      for (let y = r.at[1]; y <= r.at[1] + r.cells[1]; y++)
        for (let x = r.at[0]; x <= r.at[0] + r.cells[0]; x++) {
          closed[x + nx * (y + ny * z)] = ri + 1;
          if (x < r.at[0] + r.cells[0] && y < r.at[1] + r.cells[1] && z < r.at[2] + r.cells[2])
            covered[x + cx * (y + cy * z)] = 1;
        }
  });
  const pos: number[] = [];
  const s = new Float64Array(3);
  for (let z = 0; z < nz - 1; z++)
    for (let y = 0; y < ny - 1; y++)
      for (let x = 0; x < nx - 1; x++) {
        const id = x + cx * (y + cy * z);
        if (covered[id] || !cellOffset(v, nx, ny, x, y, z, s)) continue;
        cells[id] = pos.length / 3;
        pos.push(
          o[0] + (x + (s[0] ?? 0)) * h,
          o[1] + (y + (s[1] ?? 0)) * h,
          o[2] + (z + (s[2] ?? 0)) * h,
        );
      }
  const fineCells = regions.map((r) => {
    const ids = new Int32Array((r.nx - 1) * (r.ny - 1) * (r.nz - 1)).fill(-1);
    const hf = h / r.f;
    for (let z = 0; z < r.nz - 1; z++)
      for (let y = 0; y < r.ny - 1; y++)
        for (let x = 0; x < r.nx - 1; x++) {
          if (!cellOffset(r.values, r.nx, r.ny, x, y, z, s)) continue;
          ids[x + (r.nx - 1) * (y + (r.ny - 1) * z)] = pos.length / 3;
          pos.push(
            o[0] + (r.at[0] * r.f + x + (s[0] ?? 0)) * hf,
            o[1] + (r.at[1] * r.f + y + (s[1] ?? 0)) * hf,
            o[2] + (r.at[2] * r.f + z + (s[2] ?? 0)) * hf,
          );
        }
    return ids;
  });
  const tris: number[] = [];
  const quad = quadEmitter(pos, tris);
  /** A polygon of up to 4 leaves in winding order: repeated corners drop, < 3 left emits nothing. */
  const poly = (a: number, b: number, c: number, d: number, out: boolean): void => {
    if (a < 0 || b < 0 || c < 0 || d < 0)
      invalid(
        'sdf detail stitch found an edge without a surface vertex (internal: inconsistent levels)',
        'report this field and detail box; meanwhile move the box off the surface feature',
      );
    const ring = [a, b, c, d].filter((x, i, all) => x !== all[(i + 3) % 4]);
    if (ring.length === 4) quad(a, b, c, d, out);
    else if (ring.length === 3) {
      const [p, q, r] = ring as [number, number, number];
      if (out) tris.push(p, q, r);
      else tris.push(p, r, q);
    }
  };
  const cell = (x: number, y: number, z: number): number => cells[x + cx * (y + cy * z)] ?? -1;
  for (let z = 1; z < nz - 1; z++)
    for (let y = 1; y < ny - 1; y++)
      for (let x = 1; x < nx - 1; x++) {
        const at = x + nx * (y + ny * z);
        const inside = (v[at] ?? 1) < 0;
        const mine = closed[at] ?? 0;
        // Same edge order and corner order as surfaceNets; skip edges a box refines.
        if (inside !== (v[at + 1] ?? 1) < 0 && !(mine && closed[at + 1] === mine))
          poly(cell(x, y - 1, z - 1), cell(x, y, z - 1), cell(x, y, z), cell(x, y - 1, z), inside);
        if (inside !== (v[at + nx] ?? 1) < 0 && !(mine && closed[at + nx] === mine))
          poly(cell(x - 1, y, z - 1), cell(x - 1, y, z), cell(x, y, z), cell(x, y, z - 1), inside);
        if (inside !== (v[at + nx * ny] ?? 1) < 0 && !(mine && closed[at + nx * ny] === mine))
          poly(cell(x - 1, y - 1, z), cell(x, y - 1, z), cell(x, y, z), cell(x - 1, y, z), inside);
      }
  regions.forEach((r, ri) => {
    const ids = fineCells[ri] ?? new Int32Array(0);
    const [fx, fy] = [r.nx - 1, r.ny - 1];
    // Leaf around fine-lattice cell (I, J, K) of this box: a fine cell inside, else its coarse cell.
    const leaf = (I: number, J: number, K: number): number =>
      I >= 0 && J >= 0 && K >= 0 && I < fx && J < fy && K < r.nz - 1
        ? (ids[I + fx * (J + fy * K)] ?? -1)
        : cell(
            r.at[0] + Math.floor(I / r.f),
            r.at[1] + Math.floor(J / r.f),
            r.at[2] + Math.floor(K / r.f),
          );
    const val = r.values;
    for (let z = 0; z < r.nz; z++)
      for (let y = 0; y < r.ny; y++)
        for (let x = 0; x < r.nx; x++) {
          const at = x + r.nx * (y + r.ny * z);
          const inside = (val[at] ?? 1) < 0;
          if (x < r.nx - 1 && inside !== (val[at + 1] ?? 1) < 0)
            poly(
              leaf(x, y - 1, z - 1),
              leaf(x, y, z - 1),
              leaf(x, y, z),
              leaf(x, y - 1, z),
              inside,
            );
          if (y < r.ny - 1 && inside !== (val[at + r.nx] ?? 1) < 0)
            poly(
              leaf(x - 1, y, z - 1),
              leaf(x - 1, y, z),
              leaf(x, y, z),
              leaf(x, y, z - 1),
              inside,
            );
          if (z < r.nz - 1 && inside !== (val[at + r.nx * r.ny] ?? 1) < 0)
            poly(
              leaf(x - 1, y - 1, z),
              leaf(x, y - 1, z),
              leaf(x, y, z),
              leaf(x - 1, y, z),
              inside,
            );
        }
  });
  return { pos, tris };
}
