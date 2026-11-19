// Procedural material generator: paints the shared trim sheet (albedo, normal, ORM) from code —
// brick bonds, plank grain (oak, pine, weathered, painted), riveted plates, bare/cast/painted/
// galvanised metal, canvas, leather, slate, concrete, glass, decal cells and cutout foliage cards
// — at a fixed seed, so the texture is as deterministic as the meshes. Supplied PNGs (reference
// photos, kubeez.com generations) can stamp cells; they are inputs, never the only path.
//
// Conventions: V (image row) grows with world up, as box/planar map faces; strips tile seamlessly
// along U and span `stripRect().metres` there and `scaleMetres` along V; classic strips are
// near-greyscale sRGB (vertex colour tints them); library/defined material strips, foliage and
// stamped cells carry colour. Project strips (`defineMaterial`) paint after the built-ins: the ids
// passed as `materials` (one asset's: `sheetFor` does this), or every defined one when they fit.
// Every region paints from its own seed onto its own canvas and pads inside its own rectangle, so
// a row's texels never depend on which other rows were painted (`paintStrips` relies on it).

import { createRng, Ts23dError } from '../core/index.ts';
import { createCanvas } from './paint/canvas.ts';
import { paintCell } from './paint/cell.ts';
import { blankSheet, composeRegion } from './paint/compose.ts';
import { DEFAULT_SHEET } from './paint/default-sheet.ts';
import { paintStrip } from './paint/strip.ts';
import type { PaintedSheet, SheetRecipe } from './paint/types.ts';
import { validateSheet, validateStrip } from './paint/validate.ts';
import { customIds, customIndex, inRowOrder } from './slots.ts';
import { CELLS, cellRect, rectOf, STRIP_H, STRIPS, type StripId } from './trim-sheet.ts';

export { DEFAULT_SHEET } from './paint/default-sheet.ts';
export type {
  CellImage,
  MaterialPainter,
  MaterialSurface,
  PaintedSheet,
  PaintKit,
  SheetRecipe,
  StripKind,
  StripRecipe,
} from './paint/types.ts';

const FALLBACK = { kind: 'noise', scaleMetres: 1, roughness: 0.6 } as const;

/**
 * The project materials a sheet will hold, in row order: `ids`, or every defined material.
 * Throws when two of them hold one row (a sheet row shows one material) or one is not defined.
 */
export function sheetMaterials(ids?: readonly string[]): readonly string[] {
  const all = ids ? inRowOrder(ids) : customIds();
  all.forEach((id, i) => {
    const before = all[i - 1];
    if (customIndex(id) < 0)
      throw new Ts23dError('T3D_MATERIAL_UNKNOWN', {
        cause: `the sheet was asked to paint material '${id}', which is not defined`,
        fix: `defineMaterial({ id: '${id}', ... }) before painting, or leave it out of the list`,
      });
    if (before !== undefined && customIndex(before) === customIndex(id))
      throw new Ts23dError('T3D_MATERIAL_CONFLICT', {
        cause: `materials '${before}' and '${id}' both hold custom strip row ${customIndex(id)}, and one sheet shows one material per row${ids ? '' : ' (painting every defined material)'}`,
        fix: 'paint the sheet of one asset: sheetFor(compile(asset), recipe), which holds only the materials that asset maps onto; or give one of the two another `row`',
      });
  });
  return all;
}

/** Paint `ids`' strips into `sheet` (each into its own row; nothing else is touched). */
export function paintStrips(
  sheet: PaintedSheet,
  recipe: SheetRecipe,
  ids: readonly StripId[],
): void {
  const size = sheet.size;
  const rng = createRng(recipe.seed);
  // Replicate edge texels 1/8 of a strip row deep (8 px at 4096²): the first three mips stay clean.
  const pad = Math.max(2, Math.round((size * STRIP_H) / 8));
  for (const id of ids) {
    const r = recipe.strips[id] ?? DEFAULT_SHEET.strips[id] ?? FALLBACK;
    validateStrip(`strips.${id}`, r);
    const rect = rectOf(id);
    const h = Math.round((rect.v1 - rect.v0) * size);
    const c = createCanvas(size, h, rect.metres, r.scaleMetres, true);
    paintStrip(c, r, rng.fork(id).int(0, 0x7fffffff), `strips.${id}`);
    composeRegion(sheet, c, 0, Math.round(rect.v0 * size), pad);
  }
}

/**
 * Paint a sheet: the built-in strips and cells, then the project materials `materials` names
 * (default: every defined one, which throws T3D_MATERIAL_CONFLICT once two of them hold one row;
 * for an asset, `sheetFor(compiled, recipe)` paints exactly its own and caches the built-ins).
 */
export function paintTrimSheet(
  recipe: SheetRecipe = DEFAULT_SHEET,
  materials?: readonly string[],
): PaintedSheet {
  validateSheet(recipe);
  const custom = sheetMaterials(materials);
  const size = recipe.size ?? 4096;
  const sheet = blankSheet(size);
  const rng = createRng(recipe.seed);
  const pad = Math.max(2, Math.round((size * STRIP_H) / 8));
  paintStrips(sheet, recipe, [...STRIPS, ...(custom as readonly StripId[])]);
  for (const id of CELLS) {
    const e = recipe.cells?.[id] ?? DEFAULT_SHEET.cells?.[id] ?? FALLBACK;
    const rect = cellRect(id);
    const w = Math.round((rect.u1 - rect.u0) * size);
    const c = createCanvas(w, w, rect.metres, rect.metres, false);
    paintCell(c, id, e, rng.fork(id).int(0, 0x7fffffff));
    composeRegion(sheet, c, Math.round(rect.u0 * size), Math.round(rect.v0 * size), pad);
  }
  return { ...sheet, strips: custom };
}
