// Orc bust assembly on the shared skull pipeline (../_lib/bust/bust.ts `bustEdits`): the CC0 base
// warped to the orc (spec.ts) → planes → muscles → features → skin zones, on the orc's own torso
// (torso.ts: the neck leaning into trapezius that rise to the ears), plus the orc features
// (features.ts) and swept tusks rooted in the jaw (tusks.ts). One sculpt meshed as two parts split
// at the seam the fur mantle hides — `head` fine, `bust` coarser (LOD2: one coarse `head`) — then
// the gear on the stage-2 skin: plate pauldrons with bone spikes, baldric, fur mantle, necklace,
// the warrior's knot and card hair; socketed `eye_l` / `eye_r`; a turned plinth; vertex AO.

import {
  type BuildContext,
  bakeAo,
  type DetailRegion,
  type Mesh,
  merge,
  type PartOptions,
} from '@developerz.ai/ts23d';
import { type BustRecipe, bustEdits, faceDetail } from '../_lib/bust/bust.ts';
import { eyes } from '../_lib/bust/eye.ts';
import type { Surface } from '../_lib/bust/kit.ts';
import { cardHair } from '../_lib/face/hair-cards.ts';
import { armour } from './armour.ts';
import { featureEdits, toneEdits } from './features.ts';
import { furMantle, necklace, seamField } from './fur.ts';
import { hairKnot, orcCardHair } from './hair.ts';
import { C } from './palette.ts';
import { plinth } from './plinth.ts';
import { ORC_TONE, skinMesh } from './skin.ts';
import { BL, CHARACTER, EAR, EYE, SK, SPEC, TORSO } from './spec.ts';
import { torsoEdits } from './torso.ts';
import { tusks } from './tusks.ts';

export const ORC_BUST: BustRecipe = {
  spec: SPEC,
  skull: CHARACTER,
  // A brute: hard planes, a brow shelf, heavy cheekbones and masseters, a corded neck, deep lines.
  forms: { planes: 1.4, brow: 2.6, cheek: 1.3, jaw: 1.1, neck: 1.4, lines: 1.6, lips: 0.5 },
  zones: { lips: C.lips, flush: C.flush, socket: C.socket, brows: C.brow },
  l: BL,
  eye: EYE,
  ear: EAR,
  torso: TORSO,
  tone: ORC_TONE,
  plinth: { radius: 0.13, color: C.plinth },
  cells: { head: [0.0055, 0.0105, 0.03], bust: [0.0095, 0.018, 0.032] },
  // The torso's stage-4 neck veins ran over the skull stage's wider jaw: muscle borders only.
  body: (stage, skin) => torsoEdits(Math.min(stage, 3), skin),
  features: (stage, skin, lod, rng) => [
    ...featureEdits(stage, skin, lod, rng),
    ...(stage >= 4 ? toneEdits() : []),
  ],
  hair: () => [],
  outfit: () => [],
};

/** The stage-2 skin (skull, planes, torso) the gear, strokes and hair lie on. */
export function bodySurface(lod = 0): Surface {
  return bustEdits(ORC_BUST, 2, lod).skin;
}

/** LOD0 detail boxes: the shared eye and ear boxes, and the mouth and nose base at half cell
 *  (the closed lips and nostrils alias at the head cell). */
function detail(): DetailRegion[] {
  const w = Math.abs(SK.cheilion[1]) + 0.012;
  return [
    ...faceDetail(ORC_BUST),
    {
      bounds: [
        [SK.stomion[0] - 0.035, -w, SK.stomion[2] - 0.025],
        [SK.pronasale[0] + 0.01, w, SK.alare[2]],
      ],
      factor: 2,
    },
  ];
}

export function buildOrc(ctx: BuildContext): void {
  const lod = ctx.lod;
  const { edits, skin } = bustEdits(ORC_BUST, ctx.pick([4, 4, 2]), lod, ctx.rng.fork('features'));
  const cell = ctx.pick(ORC_BUST.cells.head);
  const bustCell = ctx.pick(ORC_BUST.cells.bust);
  const rng = ctx.rng.fork('skin');
  // One sculpt, two parts split at the seam the fur collar hides; each laps a cell past it.
  const seam = seamField();
  const lap = bustCell * 0.5;
  const meshes: Record<string, Mesh> =
    lod === 2
      ? { head: skinMesh(edits, cell, { rng }) }
      : {
          head: skinMesh(edits, cell, {
            rng,
            bumps: lod === 0 ? 0.0003 : 0,
            ...(lod === 0 ? { detail: detail() } : {}),
            clip: (p) => -seam(p) - lap,
            within: [
              [-0.22, -0.3, 0.16],
              [0.28, 0.3, 0.7],
            ],
          }),
          bust: skinMesh(edits, bustCell, {
            rng,
            clip: (p) => seam(p) - lap,
            within: [
              [-0.3, -0.4, 0],
              [0.3, 0.4, 0.46],
            ],
          }),
        };
  meshes['tusks'] = tusks(lod);
  const gear = armour(ctx, skin);
  meshes['pauldrons'] = gear.pauldrons;
  meshes['spikes'] = gear.spikes;
  if (gear.harness) meshes['harness'] = gear.harness;
  meshes['mantle'] = furMantle(ctx, skin);
  if (lod < 2) meshes['necklace'] = necklace(ctx, skin);
  meshes['hair_knot'] = hairKnot(ctx, skin);
  meshes['plinth'] = plinth(ctx);
  const all = merge(Object.values(meshes));
  // The bone spikes stand in iron collars riveted to the pauldron caps (a weld onto the plate);
  // the tusks grow out of the jaw.
  const opts: Record<string, PartOptions> = {
    spikes: { connect: { as: 'welded', to: 'pauldrons' } },
  };
  for (const [name, m] of Object.entries(meshes))
    ctx.part(
      name,
      lod < 2 ? bakeAo(m, { samples: ctx.pick([14, 9, 6]), radius: 0.1, strength: 0.5 }, all) : m,
      opts[name] ?? {},
    );
  cardHair(ctx, orcCardHair(skin));
  eyes(ctx, EYE, {
    cell: ctx.pick([0.0016, 0.003, 0.008]),
    finish: 'cornea',
    proud: lod === 0 ? 0 : cell * 0.3,
    // The orbit's seat resolves at LOD0 only (coarser cells close the hollow).
    ...(lod === 0 ? { socketIn: 'head' } : {}),
  });
}
