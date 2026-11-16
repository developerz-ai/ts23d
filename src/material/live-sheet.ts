// A painted trim sheet that knows when it is stale. Recipes may define materials while they
// compile (fur and hair cards register their strand strips inside `build`), after a caller has
// already painted the sheet; exporting or rendering with that sheet drops the new rows (D47).
// `current()` repaints only when the material generation moved since the last paint.

import { materialGeneration } from './define.ts';
import type { PaintedSheet, SheetRecipe } from './generator.ts';
import { paintTrimSheet } from './generator.ts';

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
