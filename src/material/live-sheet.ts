// A painted trim sheet that knows when it is stale. Recipes may define materials while they
// compile (fur and hair cards register their strand strips inside `build`), after a caller has
// already painted the sheet; exporting or rendering with that sheet drops the new rows (D47).
// `current()` repaints only when the material generation moved since the last paint.
// `checkSheetFor` is the renderers' guard: a sheet painted before compile, used for an asset whose
// UVs land in a strip defined during that compile, would show the blank (opaque white) row.

import { Ts23dError } from '../core/index.ts';
import { materialGeneration } from './define.ts';
import type { PaintedSheet, SheetRecipe } from './generator.ts';
import { paintTrimSheet } from './generator.ts';
import { rowsSampled } from './rows-sampled.ts';
import { customIds } from './slots.ts';
import { stripRow } from './trim-sheet.ts';

export interface LiveSheet {
  /** The sheet for the materials defined right now; `repainted` when it had to paint. */
  current(): { readonly sheet: PaintedSheet; readonly repainted: boolean };
}

export function liveSheet(recipe: SheetRecipe): LiveSheet {
  let painted: PaintedSheet | undefined;
  let at = -1;
  return {
    current() {
      const now = materialGeneration();
      if (painted && at === now) return { sheet: painted, repainted: false };
      painted = paintTrimSheet(recipe);
      at = now;
      return { sheet: painted, repainted: true };
    },
  };
}

/**
 * Throw when `uvs` (u, v pairs) land in a project strip `sheet` was painted without. Pass the
 * mesh's `indices` for an exact, per-triangle answer (`rowsSampled`).
 */
export function checkSheetFor(
  sheet: PaintedSheet,
  uvs: ArrayLike<number>,
  indices?: ArrayLike<number>,
): void {
  const painted = sheet.strips;
  if (!painted) return;
  const missing = customIds().filter((id) => !painted.includes(id));
  if (!missing.length) return;
  const vs = new Float64Array(uvs.length >> 1);
  for (let i = 0; i < vs.length; i++) vs[i] = uvs[i * 2 + 1] ?? -1;
  const rows = rowsSampled(vs, indices);
  for (const id of missing)
    if (rows.has(stripRow(id)))
      throw new Ts23dError('T3D_MATERIAL_UNKNOWN', {
        cause: `the trim sheet was painted before material '${id}' was defined, and the asset maps into its row: it would render as a blank, opaque strip`,
        fix: 'paint the sheet after compile(asset) (liveSheet(recipe).current() repaints when materials changed), or omit `sheet` and let the renderer paint one',
      });
}
