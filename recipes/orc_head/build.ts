// Orc bust assembly: one skin sculpt (skull + face + jaw + ears + neck + torso, so no seam shows at
// the neck), eyeballs as their own pivoted parts, armour, hair knot and plinth. `stage` replays
// the sculpting order (1 block-out … 4 secondary/tertiary) for silhouette checks; the asset
// builds stage 4. LOD policy: sculpt cell 4.2 / 8 / 22 mm; LOD2 keeps primaries and planes only.

import {
  type BuildContext,
  bakeAo,
  createRng,
  type Mesh,
  merge,
  type Rng,
  type SculptEdit,
  sculptField,
} from '@developerz.ai/ts23d';
import { eyes } from '../_lib/bust/eye.ts';
import { type Surface, surface } from '../_lib/bust/kit.ts';
import { armour } from './armour.ts';
import { defectEdits } from './defects.ts';
import { earEdits } from './ears.ts';
import { ORC_EYE } from './eyes.ts';
import { faceEdits } from './face.ts';
import { furMantle, necklace, seamField } from './fur.ts';
import { hairKnot } from './hair.ts';
import { jawEdits } from './jaw.ts';
import { warPaint } from './paint.ts';
import { C } from './palette.ts';
import { plinth } from './plinth.ts';
import { skinMesh } from './skin.ts';
import { skullEdits } from './skull.ts';
import { torsoEdits } from './torso.ts';

/** Skin sculpt cell per LOD, metres. */
export const CELL = [0.0057, 0.0115, 0.04] as const;

export interface OrcOptions {
  /** Sculpt stage to stop at (1 block-out, 2 planes, 3 features, 4 secondary/tertiary). */
  readonly stage?: number;
  /** Leave the armour, hair and plinth off (look at the anatomy alone). */
  readonly bare?: boolean;
}

/** The skin's edit list at a stage. Stage 3+ strokes (creases, clay strips, scars) are laid ON
 *  the stage-2 surface (primaries + planes), so every line follows the real skin. */
export function skinEdits(stage: number, torso = true, rng: Rng = createRng(1)): SculptEdit[] {
  const forms = (st: number, s?: Surface): SculptEdit[] => [
    ...(torso ? torsoEdits(st, s) : []),
    ...skullEdits(st, s),
    ...jawEdits(st, s),
    ...faceEdits(st, s),
    { group: earEdits(st), blend: 0.014 },
  ];
  if (stage < 3) return forms(stage);
  const s = bodySurface(torso);
  return [...forms(stage, s), ...defectEdits(stage, s), ...warPaint(stage, s, rng.fork('paint'))];
}

/** The stage-2 skin (primaries + planes) as a surface to lay strokes, straps and paint on. */
export function bodySurface(torso = true): Surface {
  const edits = [
    ...(torso ? torsoEdits(2) : []),
    ...skullEdits(2),
    ...jawEdits(2),
    ...faceEdits(2),
    { group: earEdits(2), blend: 0.014 },
  ];
  return surface(sculptField(edits, { color: C.skin, mirror: 'y' }).field);
}

/** Skin sculpt cell per LOD for the `bust` (torso) part, metres: it carries less detail. */
export const BUST_CELL = [0.0095, 0.018, 0.032] as const;

export function buildOrc(ctx: BuildContext, o: OrcOptions = {}): void {
  // LOD2 is a silhouette: the planes stage at the coarse cell.
  const stage = Math.min(o.stage ?? 4, ctx.pick([4, 4, 2]));
  const cell = CELL[ctx.lod];
  const edits = skinEdits(stage, true, ctx.rng.fork('skin-edits'));
  const rng = ctx.rng.fork('skin');
  const bumps = ctx.lod === 0 ? 0.00035 : 0;
  // One sculpt, two parts split at a seam the fur collar hides: the head at a fine cell, the
  // torso at a coarser one. Each laps a cell past the seam so no gap can open.
  const seam = seamField();
  const lap = BUST_CELL[ctx.lod] * 0.5;
  // LOD2: one coarse sculpt, no split (nothing up close to need the fine head cell).
  const meshes: Record<string, Mesh> =
    ctx.lod === 2
      ? { head: skinMesh(edits, cell, { rng }) }
      : {
          head: skinMesh(edits, cell, {
            rng,
            bumps,
            clip: (p) => -seam(p) - lap,
            within: [
              [-0.2, -0.3, 0.24],
              [0.25, 0.3, 0.7],
            ],
          }),
          bust: skinMesh(edits, BUST_CELL[ctx.lod], {
            rng,
            clip: (p) => seam(p) - lap,
            within: [
              [-0.3, -0.4, 0],
              [0.3, 0.4, 0.46],
            ],
          }),
        };
  if (!o.bare) {
    const body = bodySurface();
    const gear = armour(ctx, body);
    meshes['pauldrons'] = gear.pauldrons;
    meshes['spikes'] = gear.spikes;
    if (gear.harness) meshes['harness'] = gear.harness;
    meshes['mantle'] = furMantle(ctx, body);
    if (ctx.lod < 2) meshes['necklace'] = necklace(ctx, body);
    meshes['hair'] = hairKnot(ctx, body);
    meshes['plinth'] = plinth(ctx);
  }
  // Vertex AO across every part (LOD0/1): creases, under the jaw, under the pauldrons and fur.
  const all = merge(Object.values(meshes));
  const ao = (m: Mesh): Mesh =>
    ctx.lod < 2
      ? bakeAo(m, { samples: ctx.pick([16, 10, 8]), radius: 0.12, strength: 0.5 }, all)
      : m;
  // The bone spikes stand in iron collars riveted to the pauldron caps: a hard weld onto the
  // plate, not flesh growing out of the bust (which their name would default to).
  for (const [name, m] of Object.entries(meshes))
    ctx.part(name, ao(m), name === 'spikes' ? { connect: { as: 'welded', to: 'pauldrons' } } : {});
  eyes(ctx, ORC_EYE, {
    cell: ctx.pick([0.0024, 0.0045, 0.012]),
    finish: 'cornea',
    proud: ctx.lod === 0 ? 0 : cell * 0.35,
  });
}
