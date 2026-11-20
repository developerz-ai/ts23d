// Say which project materials a mesh's UVs map onto (D354). The trim sheet's custom rows are per
// asset and several materials may share a row, so UVs alone cannot name the material: the mesh
// carries it (`Mesh.mapped`), and the compile it is added to records it, wherever the mesh was
// built. Every primitive calls this for its `strip`; call it yourself for UVs you write by hand.
// Built-in strips need no record (their rows are the same on every sheet). A mesh mapped while
// no compile runs is a module-level constant: its material is listed (slots.ts), so that a copy
// of it which lost the record is refused instead of painted as another material.

import { type MappedMaterial, type Mesh, materialsInUse, withMapped } from '../core/index.ts';
import { noteOutside } from './slots.ts';
import { STRIP_H, STRIPS, type StripId, stripRow, variantOf } from './trim-sheet.ts';

/**
 * `mesh`, saying its UVs map onto the strips `ids`. Built-in and unknown ids add nothing, and a
 * mesh with nothing to add is returned as it is.
 * @example
 * const skin = stripRect('my_skin');
 * const body = mappedOnto({ ...mesh, uvs: handWritten(skin) }, 'my_skin');
 */
export function mappedOnto(mesh: Mesh, ...ids: readonly StripId[]): Mesh {
  const uses: MappedMaterial[] = [];
  const outside = materialsInUse() === undefined;
  for (const id of ids) {
    const row = stripRow(id);
    if (row < STRIPS.length) continue;
    const base = variantOf(id).base;
    if (outside) noteOutside(base);
    uses.push({ id: base, row: row - STRIPS.length, v0: row * STRIP_H, v1: (row + 1) * STRIP_H });
  }
  return withMapped(mesh, uses);
}
