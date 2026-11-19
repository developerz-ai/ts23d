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
  type Mesh,
  merge,
  type PartOptions,
  sculptField,
  weather,
} from '@developerz.ai/ts23d';
import { type BustRecipe, bustEdits, faceDetail, oilOf } from '../_lib/bust/bust.ts';
import { eyes } from '../_lib/bust/eye.ts';
import { faceRigOf, withFace } from '../_lib/bust/face-rig.ts';
import { type Surface, surface } from '../_lib/bust/kit.ts';
import { cardHair } from '../_lib/face/hair-cards.ts';
import { armour } from './armour.ts';
import { featureEdits, toneEdits } from './features.ts';
import { furMantle, necklace, seamField } from './fur.ts';
import { beardRegion, hairKnot, orcCardHair, scalpLock } from './hair.ts';
import { C } from './palette.ts';
import { plinth } from './plinth.ts';
import { ORC_TONE, skinMesh } from './skin.ts';
import { BL, CHARACTER, EAR, EYE, SPEC, TORSO } from './spec.ts';
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
  cells: { head: [0.0076, 0.014, 0.036], bust: [0.014, 0.024, 0.038] },
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

const FIELD = { color: SPEC.skin, mirror: 'y' } as const;

export function buildOrc(ctx: BuildContext): void {
  const lod = ctx.lod;
  const { edits, skin } = bustEdits(ORC_BUST, ctx.pick([4, 4, 2]), lod, ctx.rng.fork('features'));
  const cell = ctx.pick(ORC_BUST.cells.head);
  const bustCell = ctx.pick(ORC_BUST.cells.bust);
  const rng = ctx.rng.fork('skin');
  // One sculpt, two parts split at the seam the fur collar hides; each laps a cell past it.
  const seam = seamField();
  const lap = bustCell * 0.5;
  // The chin and the crown patch painted hair-coloured under the cards (D57).
  const scalp = [
    { line: beardRegion, color: C.hairRoot, soft: 0.008 },
    { line: scalpLock, color: C.hairRoot },
  ];
  // The hide on the shared pore strip: matte, cratered cheeks, a glossier brow, nose and chin.
  const oil = oilOf(ORC_BUST);
  const strip = oil ? { oil } : {};
  const meshes: Record<string, Mesh> =
    lod === 2
      ? // (No pore speckle and a wider stencil at the far cell: per-vertex specks 3 cm apart read
        // as camouflage blotches; each vertex takes its faces' mean colour.)
        {
          head: skinMesh(edits, cell, {
            rng,
            scalp,
            speckle: 0,
            stencil: 0.016,
            strip,
            far: true,
          }),
        }
      : {
          head: skinMesh(edits, cell, {
            rng,
            scalp,
            strip,
            bumps: lod === 0 ? 0.0003 : 0,
            ...(lod === 0 ? { detail: faceDetail(ORC_BUST) } : {}),
            clip: (p) => -seam(p) - lap,
            within: [
              [-0.22, -0.3, 0.16],
              [0.28, 0.3, 0.7],
            ],
          }),
          bust: skinMesh(edits, bustCell, {
            rng,
            strip,
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
  // The fur and the strap carry the road: mud dried into the fur's lower clumps and the strap's
  // low end, dust on what faces up.
  const fresh: Record<string, Mesh> = { mantle: furMantle(ctx, skin) };
  if (gear.harness) fresh['harness'] = gear.harness;
  const soft = weather(ctx, fresh, {
    name: 'fur_and_strap',
    age: 0.7,
    resolution: 0,
    groundBand: 0.1,
    effects: {
      mud: { amount: 0.5, strength: 0.55, color: [0.1, 0.075, 0.05] },
      dust: { amount: 0.3, strength: 0.4, color: [0.36, 0.3, 0.22] },
    },
  });
  Object.assign(meshes, soft);
  if (lod < 2) meshes['necklace'] = necklace(ctx, skin);
  meshes['hair_knot'] = hairKnot(ctx, skin);
  meshes['plinth'] = plinth(ctx);
  const all = merge(Object.values(meshes));
  // The bone spikes stand in iron collars riveted to the pauldron caps (a weld onto the plate);
  // the tusks grow out of the jaw.
  const opts: Record<string, PartOptions> = {
    spikes: { connect: { as: 'welded', to: 'pauldrons' } },
    head: { parent: 'face', finish: 'skin' },
    bust: { parent: 'face', finish: 'skin' },
  };
  // Head and bust carry the blink / talk / breathe morphs under one `face` node (headClips('face')).
  const rig = faceRigOf(ORC_BUST);
  ctx.group('face');
  for (const [name, m] of Object.entries(meshes)) {
    const lit =
      lod < 2 ? bakeAo(m, { samples: ctx.pick([14, 9, 6]), radius: 0.1, strength: 0.5 }, all) : m;
    ctx.part(name, withFace(name, lit, rig), opts[name] ?? {});
  }
  // The cards root on the finished head (brow shelf, jaw and all), not the stage-2 skin: the
  // brow and beard roots would sit buried under the stage-3 strokes.
  // (The far LOD keeps the beard and the brows as a handful of wide cards.)
  cardHair(ctx, orcCardHair(surface(sculptField(edits, FIELD).field)));
  eyes(ctx, EYE, {
    cell: ctx.pick([0.002, 0.0036, 0.01]),
    finish: 'cornea',
    proud: lod === 0 ? 0 : cell * 0.3,
    // The orbit's seat resolves at LOD0 only (coarser cells close the hollow).
    ...(lod === 0 ? { socketIn: 'head' } : {}),
  });
}
