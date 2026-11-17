// Emberwing, an original fantasy drake, model-first (plan 2026/11/16/101 slice 11). The surface
// is an image-to-3D model's dragon, whole, with its own textures on all three LODs: body, horns,
// claws and both membrane wings. Code keeps the animal: the design scale (spec.ts), a quadruped
// skeleton, the walk, the mass, the LOD budgets and QA. The wings carry no bones (the learned
// rigger gives none): they ride with the chest, raised, and do not flap. The chain (surface.ts):
// concept image → Pixal3D mesh → Blender proxy → UniRig joints → Blender steps (steps.ts) →
// importModel. With no cache every request misses and this is a code-built quadruped of the
// creature kind at the same scale, without wings.

import {
  type Check,
  type CheckFinding,
  CREATURE_MATERIALS,
  defineMaterial,
  defineModelCreature,
} from '@developerz.ai/ts23d';
import { DESIGN, DRAKE } from './spec.ts';
import { TRIANGLES } from './steps.ts';
import { dragonModel } from './surface.ts';

export { CONCEPT } from './concept.ts';

const SCALES = defineMaterial(CREATURE_MATERIALS.fur_neutral);

/** The box of THIS pose, from the design spec (README.md, "Scale"): nose to tail tip, the wings
 *  raised in a V, the wing tips. */
export const BOX = { length: 5.0, width: 2.8, height: 3.3 } as const;

/** The design spec read on the model body (README.md table), metres. */
export const SOURCED = {
  /** Top of the back over the shoulders: the 1.6 m shoulder, − 6 % … + 10 % (the dorsal crest). */
  withers: [DESIGN.shoulder * 0.94, DESIGN.shoulder * 1.1],
  /** Nose → rump: 3.2 m ± 5 %. */
  headBody: [DESIGN.headBody * 0.95, DESIGN.headBody * 1.05],
  /** The free tail along its bones: they span 85 % of the 2.6 m tail (the thin tip carries no
   *  joint), so 75–100 % of it. */
  tail: [DESIGN.tail * 0.75, DESIGN.tail],
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
    if (z > 0.775 * DRAKE.height) rump = Math.min(rump, x);
  }
  const tail = bones
    .filter((b) => /^tail_[1-9]\d*$/.test(b.name))
    .reduce(
      (s, b) => s + Math.hypot(b.tail[0] - b.head[0], b.tail[1] - b.head[1], b.tail[2] - b.head[2]),
      0,
    );
  return { withers, headBody: nose - rump, tail };
}

/** The model at the fitted scale still measures as the design spec (the code drake is held by
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
            message: `model body: ${k} measures ${m[k].toFixed(3)} m, design spec ${lo.toFixed(3)}–${hi.toFixed(3)} m`,
            fix: 'the model is not in the design proportions at the fitted scale: re-roll the concept or the mesh, or change the design spec in spec.ts and README.md together',
          },
        ];
  });
};

export const dragon_hybrid = defineModelCreature({
  name: 'dragon_hybrid',
  description:
    'Emberwing, an original fantasy drake standing on all fours, wings raised: 3.2 m nose to rump, 1.6 m at the shoulder, 5.0 m with the tail, 600 kg. Model tier: an image-to-3D surface (Pixal3D, MIT) with its own textures on three LODs, skinned to a quadruped skeleton (joints from UniRig) with idle, look and walk clips; the wings ride with the chest and do not flap. Without the neural cache: a code-built wingless quadruped at the same scale',
  tags: ['creature', 'fantasy', 'dragon', 'skinned', 'neural', 'model-first'],
  license: 'CC0-1.0',
  sources: [
    'recipes/dragon_hybrid/README.md (design brief and spec, borrowed anatomy, the chain, the steps)',
    'surface: Pixal3D (TencentARC, MIT) · joints: UniRig (VAST-AI, MIT) · records in recipes/dragon_hybrid/neural/',
  ],
  spec: DRAKE,
  options: { strip: SCALES },
  real: { ...BOX, tolerance: 0.05, mass: DESIGN.mass, massTolerance: 0.25 },
  budget: {
    triangles: [...TRIANGLES],
    bones: 64,
    textureSets: { count: 1, size: 2048 },
  },
  checks: [sourced],
  art: { focal: 'head', shape: 'aggressive', grounded: true },
  body: { name: 'body_scales' },
  model: dragonModel,
});
