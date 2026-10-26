// Procedural material generator: paints the shared trim sheet (albedo, normal, ORM) from code —
// brick bonds, plank grain, riveted plates, slate, concrete, glass, decal cells and cutout foliage
// cards — at a fixed seed, so the texture is as deterministic as the meshes. Supplied PNGs (reference
// photos, kubeez.com generations) can stamp cells; they are inputs, never the only path.
//
// Conventions: V (image row) grows with world up, as box/planar map faces; strips tile seamlessly
// along U and span `stripRect().metres` there and `scaleMetres` along V; albedo is near-greyscale
// sRGB (vertex colour tints it) except foliage and stamped cells, which carry colour + alpha.

import { createRng } from '../core/index.ts';
import { createCanvas } from './paint/canvas.ts';
import { paintCell } from './paint/cell.ts';
import { blankSheet, composeRegion } from './paint/compose.ts';
import { DEFAULT_SHEET } from './paint/default-sheet.ts';
import { paintStrip } from './paint/strip.ts';
import type { PaintedSheet, SheetRecipe } from './paint/types.ts';
import { validateSheet, validateStrip } from './paint/validate.ts';
import { CELLS, cellRect, STRIPS, stripRect } from './trim-sheet.ts';

export { DEFAULT_SHEET } from './paint/default-sheet.ts';
export type {
  CellImage,
  PaintedSheet,
  SheetRecipe,
  StripKind,
  StripRecipe,
} from './paint/types.ts';

const FALLBACK = { kind: 'noise', scaleMetres: 1, roughness: 0.6 } as const;

export function paintTrimSheet(recipe: SheetRecipe = DEFAULT_SHEET): PaintedSheet {
  validateSheet(recipe);
  const size = recipe.size ?? 1024;
  const sheet = blankSheet(size);
  const rng = createRng(recipe.seed);
  const seedOf = (name: string): number => rng.fork(name).int(0, 0x7fffffff);
  const pad = Math.max(2, size / 256);
  for (const id of STRIPS) {
    const r = recipe.strips[id] ?? DEFAULT_SHEET.strips[id] ?? FALLBACK;
    validateStrip(`strips.${id}`, r);
    const rect = stripRect(id);
    const h = Math.round((rect.v1 - rect.v0) * size);
    const c = createCanvas(size, h, rect.metres, r.scaleMetres, true);
    paintStrip(c, r, seedOf(id));
    composeRegion(sheet, c, 0, Math.round(rect.v0 * size), pad);
  }
  for (const id of CELLS) {
    const e = recipe.cells?.[id] ?? DEFAULT_SHEET.cells?.[id] ?? FALLBACK;
    const rect = cellRect(id);
    const w = Math.round((rect.u1 - rect.u0) * size);
    const c = createCanvas(w, w, rect.metres, rect.metres, false);
    paintCell(c, id, e, seedOf(id));
    composeRegion(sheet, c, Math.round(rect.u0 * size), Math.round(rect.v0 * size), pad);
  }
  return sheet;
}
