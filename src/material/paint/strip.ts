// Dispatch a StripRecipe to its painter, then the shared grime pass (`params.grime`, 0..1), then
// the recipe's own `paint` layer (project materials), checked for finite output. A `texture`
// recipe paints from its cached CC0 image set instead of a kind (no grime: the photo has its own).

import { paintBond } from './bond.ts';
import type { Canvas } from './canvas.ts';
import { param } from './canvas.ts';
import { paintConcrete } from './concrete.ts';
import { paintLeather, paintWeave } from './fabric.ts';
import { paintImageStrip } from './image-strip.ts';
import { checkFinite, paintKit } from './kit.ts';
import { grime } from './masks.ts';
import { paintMetal } from './metal.ts';
import { paintPlanks } from './planks.ts';
import { paintPlates } from './plates.ts';
import { paintSlate } from './slate.ts';
import { paintFlat, paintGlass, paintNoise } from './surface.ts';
import type { StripKind, StripRecipe } from './types.ts';

type Painter = (c: Canvas, r: StripRecipe, seed: number) => void;

const PAINTERS: Readonly<Record<StripKind, Painter>> = {
  bond: paintBond,
  planks: paintPlanks,
  plates: paintPlates,
  slate: paintSlate,
  concrete: paintConcrete,
  metal: paintMetal,
  weave: paintWeave,
  leather: paintLeather,
  noise: paintNoise,
  glass: paintGlass,
  flat: (c, r) => paintFlat(c, r),
};

export function paintStrip(c: Canvas, r: StripRecipe, seed: number, where = 'strip'): void {
  if (r.texture) paintImageStrip(c, r, r.texture, where);
  else {
    if (r.albedo || r.albedo2)
      c.colours = [r.albedo ?? [1, 1, 1], r.albedo2 ?? r.albedo ?? [1, 1, 1]];
    PAINTERS[r.kind](c, r, seed);
    if (r.kind !== 'glass' && r.kind !== 'flat') grime(c, param(r.params, 'grime', 0), seed + 101);
  }
  if (r.paint) {
    r.paint(c, paintKit(c, seed + 211));
    checkFinite(c, where);
  }
}
