// Dispatch a StripRecipe to its painter (a `kind`, or a texture `graph`), then the height-derived
// cavity AO / roughness (`params.cavity`, `cavityRough`; relief.ts), then the shared grime pass
// (`params.grime`, 0..1), then weathering (`wear`, `age`, `wet`; weather.ts), then the recipe's own
// `paint` layer (project materials), checked for finite output. A `texture` recipe paints from its
// cached CC0 image set instead of a kind (no grime: the photo has its own; weathering still applies).

import { paintGraph } from '../tex/graph.ts';
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
import { finishRelief } from './relief.ts';
import { paintSlate } from './slate.ts';
import { paintFlat, paintGlass, paintNoise } from './surface.ts';
import type { StripKind, StripRecipe } from './types.ts';
import { weather } from './weather.ts';

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
    if (r.graph) paintGraph(c, r.graph, seed);
    else PAINTERS[r.kind](c, r, seed);
    finishRelief(c, r.params);
    if (r.kind !== 'glass' && (r.kind !== 'flat' || r.graph))
      grime(c, param(r.params, 'grime', 0), seed + 101);
  }
  weather(c, r.params, seed + 151);
  if (r.paint) {
    r.paint(c, paintKit(c, seed + 211));
    checkFinite(c, where);
  }
}
