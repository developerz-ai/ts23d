// Brown bear, model-first (plan 2026/11/16/101 slice 10). The surface is an image-to-3D model's
// bear, whole, with its own textures on all three LODs; code keeps the animal: the sourced scale
// (spec.ts: an average adult, inside the ranges of recipes/brown_bear's dossier), the skeleton,
// the plantigrade walk, the mass, the LOD budgets and QA. The chain (surface.ts): concept image →
// Pixal3D mesh → Blender proxy → UniRig joints → Blender steps (steps.ts) → importModel;
// `defineModelCreature` turns that into bones, one skinned textured part per LOD and clips. With
// no cache every request misses and this is the code bear of the creature kind.

import {
  type ChainedModel,
  type Check,
  type CheckFinding,
  CREATURE_MATERIALS,
  defineMaterial,
  defineModelCreature,
  dmath,
  hex,
} from '@developerz.ai/ts23d';
import { type ClawOptions, clawMesh } from './claws.ts';
import { BEAR, REAL } from './spec.ts';
import { BUDGET } from './steps.ts';
import { bearModel } from './surface.ts';

export { CONCEPT } from './concept.ts';

const FUR = defineMaterial(CREATURE_MATERIALS.fur_neutral);

/** The box of THIS stand, from the sourced numbers and the pose (README.md, "Scale"). */
export const BOX = { length: 1.7, width: 0.62, height: 1.05 } as const;

/** Sourced measures read on the model body (README.md table), metres. */
export const SOURCED = {
  /** Shoulder height: the 1.0 this spec chose, − 6 % … + 10 % (the hump's coat rides above the
   *  joint, so more is allowed above than below). */
  withers: [REAL.shoulder * 0.94, REAL.shoulder * 1.1],
  /** Nose → rump: the 1.7 this spec chose from 1.0–2.8, ± 5 %. */
  headBody: [REAL.headBody * 0.95, REAL.headBody * 1.05],
  /** Tail 0.06–0.22: the free tail, past the croup (`tail_0` lies inside the body). */
  tail: [0.06, 0.22],
} as const;

/** The claws' part (LOD 0 and 1; the painted claws carry LOD 2). */
export const CLAWS = 'claws';

/** Brown bear claws: five per paw, non-retractile, fore 5–10 cm along the curve (a digger's),
 *  hind about half that (Wikipedia: Brown bear, "claws"); horn dulled by mud. */
export const CLAW: ClawOptions = {
  height: BEAR.height,
  toes: 5,
  length: { fore: 0.06, hind: 0.035 },
  radius: 0.0075,
  curl: 55,
  color: hex('#8f8168'),
};

/** The model this build drew: `extra` grows the claws on its mesh (set by `model`, read in the
 *  same build, as the kind does with its clips). */
let built: ChainedModel | null = null;

/** What the model body measures, for the check below and the tests. */
export function measured(a: Parameters<Check>[0]): {
  withers: number;
  headBody: number;
  tail: number;
} | null {
  const mesh = a.parts.find((p) => p.textures)?.mesh;
  const bones = a.skeleton?.bones ?? [];
  const shoulder = bones.find((b) => b.name === 'fore_l_0')?.head;
  if (!mesh || !shoulder) return null;
  const P = mesh.positions;
  let [withers, nose, rump] = [0, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
  for (let i = 0; i < P.length; i += 3) {
    const [x = 0, y = 0, z = 0] = [P[i], P[i + 1], P[i + 2]];
    // The back's top over the shoulder joints; the nose; the rump above the hanging tail.
    if (Math.abs(y) < 0.06 && x > shoulder[0] - 0.1 && x < shoulder[0] + 0.02)
      withers = Math.max(withers, z);
    nose = Math.max(nose, x);
    if (z > 0.775 * BEAR.height) rump = Math.min(rump, x);
  }
  const tail = bones
    .filter((b) => /^tail_[1-9]\d*$/.test(b.name))
    .reduce(
      (s, b) =>
        s + dmath.hypot(b.tail[0] - b.head[0], b.tail[1] - b.head[1], b.tail[2] - b.head[2]),
      0,
    );
  return { withers, headBody: nose - rump, tail };
}

/** The model at the fitted scale still measures as the sourced wolf (the code bear is held by
 *  the creature kind's own checks). */
const sourced: Check = (a) => {
  // Read on LOD 0, like `real.measures`: a decimated far LOD loses a millimetre of coat.
  if ((a.lod ?? 0) !== 0) return [];
  const m = measured(a);
  if (!m) return [];
  return (Object.keys(SOURCED) as (keyof typeof SOURCED)[]).flatMap((k): CheckFinding[] => {
    const [lo, hi] = SOURCED[k];
    return m[k] >= lo && m[k] <= hi
      ? []
      : [
          {
            message: `model body: ${k} measures ${m[k].toFixed(3)} m, sourced ${lo.toFixed(3)}–${hi.toFixed(3)} m`,
            fix: 'the model is not in the sourced proportions at the fitted scale: re-roll the concept or the mesh (README.md), do not widen the range',
          },
        ];
  });
};

export const bear_hybrid = defineModelCreature({
  name: 'bear_hybrid',
  description:
    'Eurasian brown bear (Ursus arctos arctos), an average adult standing on all fours: 1.7 m head and body, 1.0 m at the shoulder, 250 kg. Model tier: an image-to-3D surface (Pixal3D, MIT) with its own textures on three LODs, skinned to the sourced plantigrade skeleton (joints from UniRig) with idle, look and walk clips. Without the neural cache: the code-built creature-kind bear',
  tags: ['creature', 'animal', 'mammal', 'ursid', 'bear', 'skinned', 'neural', 'model-first'],
  license: 'CC0-1.0',
  sources: [
    'https://en.wikipedia.org/wiki/Brown_bear (head-body, shoulder, tail, mass range, skull, hump)',
    'recipes/brown_bear/README.md (the dossier and its ranges) · recipes/bear_hybrid/README.md (the chain, the steps, the measures)',
    'surface: Pixal3D (TencentARC, MIT) · joints: UniRig (VAST-AI, MIT) · records in recipes/bear_hybrid/neural/',
  ],
  spec: BEAR,
  options: { strip: FUR },
  real: { ...BOX, tolerance: 0.05, mass: REAL.mass, massTolerance: 0.25 },
  budget: {
    triangles: [...BUDGET],
    bones: 64,
    textureSets: { count: 1, size: 2048 },
  },
  checks: [sourced],
  art: { focal: 'head', shape: 'friendly', grounded: true },
  // The right side carries the claw scars and the rubbed flank (wear.ts); low enough to show
  // the belly's fringe and the mud on the legs.
  hero: { azDeg: -50, elDeg: 12 },
  model: (ctx) => {
    built = bearModel(ctx);
    return built;
  },
  extra: (ctx, info) => {
    const body = built?.model.lods[Math.min(ctx.lod, built.model.lods.length - 1)];
    if (!('model' in info) || !body) return;
    const claws = clawMesh(ctx.lod, body, info.model.bones, CLAW);
    if (claws)
      ctx.part(CLAWS, claws, { connect: { as: 'grown', to: info.model.part }, density: 1300 });
  },
});
