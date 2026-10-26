// Dispatch a StripRecipe to its painter, then the shared grime pass (`params.grime`, 0..1).

import { paintBond } from './bond.ts';
import type { Canvas } from './canvas.ts';
import { param } from './canvas.ts';
import { paintConcrete } from './concrete.ts';
import { grime } from './masks.ts';
import { paintPlanks } from './planks.ts';
import { paintPlates } from './plates.ts';
import { paintSlate } from './slate.ts';
import { paintFlat, paintGlass, paintNoise } from './surface.ts';
import type { StripRecipe } from './types.ts';

export function paintStrip(c: Canvas, r: StripRecipe, seed: number): void {
  switch (r.kind) {
    case 'bond':
      paintBond(c, r, seed);
      break;
    case 'planks':
      paintPlanks(c, r, seed);
      break;
    case 'plates':
      paintPlates(c, r, seed);
      break;
    case 'slate':
      paintSlate(c, r, seed);
      break;
    case 'concrete':
      paintConcrete(c, r, seed);
      break;
    case 'glass':
      paintGlass(c, r, seed);
      return;
    case 'noise':
      paintNoise(c, r, seed);
      break;
    case 'flat':
      paintFlat(c, r);
      return;
  }
  grime(c, param(r.params, 'grime', 0), seed + 101);
}
