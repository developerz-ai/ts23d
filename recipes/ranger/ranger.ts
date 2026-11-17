// Ranger — a full-body humanoid, model-first (plan 2026/11/16/101 slice 09). ORIGINAL design
// (README.md: brief, proportions, garment references): a lean woodsman, 1.78 m, in a hip-length
// green leather jerkin over wool trousers, bracers, a baldric and belt, tall cuffed boots.
// The surface, the skin and the motion come from a cached chain (surface.ts): concept image →
// image-to-3D → hosted rig + three clips → Blender steps (steps.ts) → importModel. Code keeps the
// real scale, the LOD budgets, the mass, the clip names and QA; the kind (`defineModelCharacter`)
// turns the import into bones, one skinned textured part per LOD and clips. With no cache the
// asset is the grey CPU mannequin (mannequin.ts): static, no clips.

import { type Check, defineModelCharacter } from '@developerz.ai/ts23d';
import { mannequin } from './mannequin.ts';
import { STEPS } from './steps.ts';
import { HEIGHT, rangerModel } from './surface.ts';

export { CONCEPT } from './concept.ts';

/** The rigged local output the Blender program starts from, for `t3d blender review` (only on the
 *  machine that ran the chain; the directory is the rig request's key and changes on a re-roll). */
export const BLENDER_REVIEW = {
  mesh: 'neural/c262653c90834c4c245d069b94cff2068e76e398fbb03edaef92ebdea203a1fc/local-0.glb',
  steps: STEPS,
};

/** Body 75 kg (BMI 23.7 at 1.78 m) + 6 kg of clothing: leather jerkin, boots, belts, bracers. */
export const MASS = 81;
/** One part: a clothed figure. The name keeps the path tracer's skin shading (a living kind's
 *  plain parts) off the leather and wool that cover nine tenths of it. */
export const PART = 'clothed_body';

/** Model clip → asset clip. `run` is reserved for part motions (ADR 013), and the library's
 *  "Run 2" is an easy 0.7 s stride, so it ships as `jog`. */
export const CLIPS = { idle: 'idle', casual_walk: 'walk', run_02: 'jog' } as const;

/** Root-height correction per clip, metres. The library's "Idle" is a wide, staggered stance
 *  retargeted to this figure's legs: the left boot rolls onto its outer edge and the toe cap goes
 *  5.8 mm under the floor (QA `gait`, LOD 0, frame 0; 3.1 mm on the right at frame 49). Raised 6 mm
 *  the lowest sole vertex of the clip rests on z = 0. `walk` and `jog` stay above the floor as
 *  they come (lowest sole vertex +3.3 mm and +0.4 mm). */
export const LIFT = { idle: 0.006 } as const;

/** Segment landmarks as shares of stature (README.md "Proportions"), checked on the rig's joints. */
export const LANDMARKS = [
  { bone: 'left_leg', what: 'knee joint', share: 0.285, tolerance: 0.08 },
  { bone: 'left_arm', what: 'shoulder joint', share: 0.8, tolerance: 0.05 },
] as const;

const anthropometry: Check = (a) => {
  const bones = a.skeleton?.bones ?? [];
  if (!bones.length) return [];
  return LANDMARKS.flatMap((l) => {
    const z = bones.find((b) => b.name === l.bone)?.head[2];
    const got = (z ?? Number.NaN) / HEIGHT;
    return Math.abs(got - l.share) / l.share <= l.tolerance
      ? []
      : [
          {
            message: `${l.what} ('${l.bone}') is at ${got.toFixed(3)} of stature, sourced ${l.share} ± ${l.tolerance * 100} %`,
            fix: 'the model or its rig is off human proportions: re-roll the mesh or the rig (README.md), do not widen the tolerance',
          },
        ];
  });
};

/** Overall a-pose box across the hands, metres (README.md "Proportions": posture, measured). */
const WIDTH = 1.02;

export const ranger = defineModelCharacter({
  name: 'ranger',
  description:
    'A woodland ranger, 1.78 m, a-pose rest, skinned to 22 bones with idle, walk and jog clips. Model tier: image-to-3D surface with its own textures, hosted rig, Blender steps. Without the neural cache: a grey CPU mannequin, no clips.',
  tags: ['character', 'humanoid', 'skinned', 'model-first'],
  sources: [
    'Proportions: Drillis & Contini 1966 segment shares of stature, as tabulated in Winter, Biomechanics and Motor Control of Human Movement, 4th ed., fig. 4.1',
    'Breadths and depths: ANSUR II (US Army 2012) male means, https://www.openlab.psu.edu/ansur2/',
    'Garments and mass: recipes/ranger/README.md',
  ],
  real: {
    length: 0.36,
    width: WIDTH,
    height: HEIGHT,
    mass: MASS,
    measures: [
      {
        label: 'stature',
        value: HEIGHT,
        axis: 'z',
        parts: [PART],
        source: 'design brief (README.md); ANSUR II male mean stature 1.756 m',
      },
    ],
  },
  budget: {
    triangles: [40000, 12000, 4000],
    bones: 64,
    draws: 1,
    textureSets: { count: 1, size: 2048 },
  },
  checks: [anthropometry],
  part: PART,
  model: rangerModel,
  clips: { rename: CLIPS, loop: Object.values(CLIPS), lift: LIFT },
  fallback: (ctx, { part, mass }) => mannequin(ctx, part, mass, WIDTH),
});
