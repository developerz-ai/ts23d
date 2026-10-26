// Paint one cell: a stamped image, a foliage card (its own painter; the recipe's roughness scales
// the leaves), or a decal motif over a backdrop of the recipe's kind.

import { type CellId, isFoliage } from '../trim-sheet.ts';
import type { Canvas } from './canvas.ts';
import { paintDoorPanel, paintSign, paintWindowSash } from './cells.ts';
import { paintClock, paintPorthole, paintSmokebox } from './cells-round.ts';
import { FOLIAGE_PAINTERS } from './foliage.ts';
import { stampImage } from './stamp.ts';
import { paintStrip } from './strip.ts';
import type { CellImage, StripRecipe } from './types.ts';

type Motif = (c: Canvas, r: StripRecipe, seed: number) => void;
const MOTIFS: Readonly<Record<string, Motif>> = {
  window_sash: paintWindowSash,
  door_panel: paintDoorPanel,
  clock: paintClock,
  smokebox: paintSmokebox,
  sign: paintSign,
  porthole: paintPorthole,
};

/** Roughness the foliage painter assumes; a recipe's own roughness rescales it. */
const LEAF_ROUGHNESS = 0.6;

export function paintCell(c: Canvas, id: CellId, entry: StripRecipe | CellImage, seed: number) {
  if ('image' in entry) {
    stampImage(c, entry.image);
    return;
  }
  if (isFoliage(id)) {
    FOLIAGE_PAINTERS[id](c, seed);
    const k = entry.roughness / LEAF_ROUGHNESS;
    for (let i = 0; i < c.rough.length; i++) c.rough[i] = Math.min(1, (c.rough[i] ?? 0.6) * k);
    return;
  }
  paintStrip(c, entry, seed);
  MOTIFS[id]?.(c, entry, seed + 1);
}
