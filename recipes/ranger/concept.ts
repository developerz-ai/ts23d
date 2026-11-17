// The concept image request (prompt → image): generation is random, so the prompt, seed, size and
// model ARE the recipe; the PNG is a committed cache output (ADR 014) that the mesh request
// (surface.ts) names by its sha256. Re-roll: change the seed or the prompt, run
// `t3d neural run recipes/ranger/ranger.ts`, READ the new image before anything is spent on it
// (the mesh and rig requests that follow are paid: README.md, "Re-roll").

import type { NeuralRequests } from '@developerz.ai/ts23d';

/** The image model: Z-Image-Turbo (Tongyi-MAI, Apache-2.0) via the reference server's `z-image`
 *  plug-in, on a local GPU. */
export const CONCEPT_MODEL = 'z-image';

/** Front view, a-pose, empty hands, plain light-grey background: what a rigging service needs
 *  (limbs apart, nothing fused to the body) and what the input-image rules ask (one subject, full
 *  frame, clean matte). An original design: no existing character, costume or emblem is named. */
export const CONCEPT: NeuralRequests['image'] = {
  seed: 42,
  prompt:
    'Game character reference, a photoreal medieval ranger, a lean man in his thirties with short brown hair and a short beard, fitted dark-green leather jerkin, brown wool trousers, leather bracers, belt with pouch, tall boots, no cloak, no weapons, empty hands, standing in A-pose, arms straight held 45 degrees away from the body, legs slightly apart, facing the camera, front view, full body in frame, plain light-grey studio background, soft even light, no shadows on background, sharp focus.',
  width: 1024,
  height: 1024,
  params: { template: 'raw' },
};
