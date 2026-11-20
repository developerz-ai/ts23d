// Grey wolf, model-first (plan 2026/11/16/101 slice 08). The surface is an image-to-3D model's
// wolf, whole, with its own textures on all three LODs; code keeps the animal: the sourced scale
// (spec.ts, the same dossier as recipes/wolf), the skeleton, the walk and trot, the mass, the LOD
// budgets and QA. The chain (surface.ts): concept image → Pixal3D mesh → Blender proxy → UniRig
// joints → Blender steps (steps.ts) → importModel; `defineModelCreature` turns that into bones,
// one skinned textured part per LOD and clips. With no cache (a fresh clone without neural/, a
// CI without a GPU) every request misses and this is the code wolf of the creature kind.

import {
  type Check,
  type CheckFinding,
  CREATURE_MATERIALS,
  defineMaterial,
  defineModelCreature,
  dmath,
} from '@developerz.ai/ts23d';
import { REAL, WOLF } from './spec.ts';
import { TRIANGLES } from './steps.ts';
import { wolfModel } from './surface.ts';

export { CONCEPT } from './concept.ts';

const FUR = defineMaterial(CREATURE_MATERIALS.fur_neutral);

/** The box of THIS stand, from the sourced numbers and the pose (README.md, "Scale"):
 *  length = head and body 1.15 + 0.09 of hanging tail brush behind the rump; height = withers
 *  0.82 + 0.13 of ears carried above them; width = the 0.22 chest + a 5 cm winter mane a side. */
export const BOX = { length: 1.24, width: 0.32, height: 0.95 } as const;

/** Sourced measures read on the model body (recipes/wolf/README.md table), metres. */
export const SOURCED = {
  /** Shoulder height 0.80–0.85; the coat over the withers adds up to a centimetre. */
  withers: [0.8, 0.86],
  /** Nose → tail root: the 1.15 this spec chose from 1.05–1.60, ± 5 %. */
  headBody: [REAL.headBody * 0.95, REAL.headBody * 1.05],
  /** Tail 0.29–0.50 along its bones. */
  tail: [0.29, 0.5],
} as const;

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
    if (z > 0.775 * WOLF.height) rump = Math.min(rump, x);
  }
  const tail = bones
    .filter((b) => /^tail_\d+$/.test(b.name))
    .reduce(
      (s, b) =>
        s + dmath.hypot(b.tail[0] - b.head[0], b.tail[1] - b.head[1], b.tail[2] - b.head[2]),
      0,
    );
  return { withers, headBody: nose - rump, tail };
}

/** The model at the fitted scale still measures as the sourced wolf (the code wolf is held by
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

export const wolf_hybrid = defineModelCreature({
  name: 'wolf_hybrid',
  description:
    'Grey wolf (Canis lupus lupus), winter coat, standing: 1.15 m head and body, 0.82 m at the withers, 40 kg. Model tier: an image-to-3D surface (Pixal3D, MIT) with its own textures on three LODs, skinned to the sourced skeleton (joints from UniRig) with idle, look, walk and trot clips. Without the neural cache: the code-built creature-kind wolf',
  tags: ['creature', 'animal', 'mammal', 'canid', 'wolf', 'skinned', 'neural', 'model-first'],
  license: 'CC0-1.0',
  sources: [
    'https://en.wikipedia.org/wiki/Wolf (length, shoulder height, tail, mass, skull, ears, fur, colour)',
    'recipes/wolf/README.md (the dossier) · recipes/wolf_hybrid/README.md (the chain, the steps, the measures)',
    'surface: Pixal3D (TencentARC, MIT) · joints: UniRig (VAST-AI, MIT) · records in recipes/wolf_hybrid/neural/',
  ],
  spec: WOLF,
  options: { strip: FUR },
  real: { ...BOX, tolerance: 0.05, mass: REAL.mass, massTolerance: 0.25 },
  budget: {
    triangles: [...TRIANGLES],
    bones: 64,
    textureSets: { count: 1, size: 2048 },
  },
  checks: [sourced],
  art: { focal: 'head', shape: 'friendly', grounded: true },
  model: wolfModel,
});
