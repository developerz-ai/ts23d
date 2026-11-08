// The whole-bust builder shared by the human, elf and goblin busts: ONE sculpt (parametric head,
// anatomical ears, torso, the recipe's hair/beard/outfit edits) meshed as two parts split at the
// neck seam under a collar — `head` fine, `bust` coarser — plus socketed `eye_l` / `eye_r`
// (cornea finish), the recipe's hard extras (brooch, jewellery) and a turned plinth, vertex AO
// across everything. A recipe supplies only its spec and its own edits.

import {
  type BuildContext,
  bakeAo,
  createRng,
  type Field,
  type Mesh,
  merge,
  type Rng,
  type SculptEdit,
  sculptField,
} from '@developerz.ai/ts23d';
import { type EarSpec, earEdits } from './ear.ts';
import { type EyeSpec, eyes } from './eye.ts';
import { faceEdits } from './face.ts';
import { type HeadSpec, headBlock, type Landmarks } from './head.ts';
import { type Surface, surface, type V } from './kit.ts';
import { plinth } from './plinth.ts';
import { type SkinTone, skinMesh } from './skin.ts';
import { checkNeck, type NeckRange, neckSeam, type TorsoSpec, torsoEdits } from './torso.ts';

export interface BustRecipe {
  readonly spec: HeadSpec;
  readonly l: Landmarks;
  readonly eye: EyeSpec;
  readonly ear: EarSpec;
  readonly torso: TorsoSpec;
  /** The neck's declared ratio ranges (default: human, NECK_HUMAN); `checkNeck` enforces them. */
  readonly neck?: NeckRange;
  readonly tone: SkinTone;
  readonly plinth: { readonly radius: number; readonly color: V };
  /** Cells per LOD: head, bust. */
  readonly cells: {
    readonly head: readonly [number, number, number];
    readonly bust: readonly [number, number, number];
  };
  /** Extra skin edits after the anatomy (race features like tusks or warts). */
  readonly features?: (stage: number, skin: Surface, lod: number, rng: Rng) => SculptEdit[];
  /** Hair, beard: `scalp` is the head block's field. */
  readonly hair: (scalp: Field, lod: number) => SculptEdit[];
  /** Outfit sculpted onto the torso: `body` is the torso's field, `skin` the stage-2 surface. */
  readonly outfit: (body: Field, skin: Surface, lod: number) => SculptEdit[];
  /** Hard extras as their own parts (brooch, earrings…). */
  readonly extras?: (ctx: BuildContext, skin: Surface) => Record<string, Mesh>;
}

function anatomy(b: BustRecipe, stage: number, lod: number, s?: Surface): SculptEdit[] {
  return [
    ...torsoEdits(b.l, b.torso),
    headBlock(b.spec, stage),
    ...faceEdits(b.spec, b.eye, stage, s),
    // LOD2: the ear keeps its tip — never thinner than the coarse cell.
    ...earEdits({
      ...b.ear,
      simple: lod === 2,
      thick: lod === 2 ? Math.max(b.ear.thick, b.cells.head[2] * 1.1) : b.ear.thick,
    }),
  ];
}

/** Every skin edit at a stage (stage 3+ strokes lie on the stage-2 surface). */
export function bustEdits(
  b: BustRecipe,
  stage: number,
  lod: number,
  rng: Rng = createRng(1),
): { edits: SculptEdit[]; skin: Surface } {
  const opts = { color: b.spec.skin, mirror: 'y' as const };
  const skin = surface(sculptField(anatomy(b, 2, lod), opts).field);
  const body = sculptField(torsoEdits(b.l, b.torso), opts).field;
  const scalp = sculptField([headBlock(b.spec, 2)], opts).field;
  return {
    skin,
    edits: [
      ...anatomy(b, stage, lod, stage >= 3 ? skin : undefined),
      ...(stage >= 3 && b.features ? b.features(stage, skin, lod, rng) : []),
      ...b.hair(scalp, lod),
      ...b.outfit(body, skin, lod),
    ],
  };
}

export function buildBust(ctx: BuildContext, b: BustRecipe): void {
  checkNeck(b.l, b.torso, b.neck);
  const lod = ctx.lod;
  const { edits, skin } = bustEdits(b, ctx.pick([4, 4, 2]), lod, ctx.rng.fork('features'));
  const seam = neckSeam(b.l).field;
  const cell = ctx.pick(b.cells.head);
  const bustCell = ctx.pick(b.cells.bust);
  const lap = bustCell * 0.5;
  const rng = ctx.rng.fork('skin');
  const { l } = b;
  const meshes: Record<string, Mesh> =
    lod === 2
      ? { head: skinMesh(edits, cell, { rng, tone: b.tone }) }
      : {
          head: skinMesh(edits, cell, {
            rng,
            tone: b.tone,
            bumps: lod === 0 ? 0.0002 : 0,
            clip: (p) => -seam(p) - lap,
            within: [
              [l.back - 0.1, -0.3, l.mz - 0.5 * l.H],
              [l.gx + 0.15, 0.3, l.crown + 0.1],
            ],
          }),
          bust: skinMesh(edits, bustCell, {
            rng,
            tone: b.tone,
            clip: (p) => seam(p) - lap,
            within: [
              [-0.4, -0.4, 0],
              [0.4, 0.4, l.mz],
            ],
          }),
          ...(b.extras ? b.extras(ctx, skin) : {}),
        };
  meshes['plinth'] = plinth(ctx, {
    radius: b.plinth.radius,
    top: b.torso.cutZ,
    color: b.plinth.color,
  });
  const all = merge(Object.values(meshes));
  for (const [name, m] of Object.entries(meshes))
    ctx.part(
      name,
      lod < 2 ? bakeAo(m, { samples: ctx.pick([14, 9, 6]), radius: 0.08, strength: 0.45 }, all) : m,
    );
  eyes(ctx, b.eye, {
    cell: ctx.pick([0.0016, 0.003, 0.008]),
    finish: 'cornea',
    proud: lod === 0 ? 0 : cell * 0.3,
    // The orbit's seat resolves at LOD0 only (coarser cells close a 1 cm-radius hollow).
    ...(lod === 0 ? { socketIn: 'head' } : {}),
  });
}
