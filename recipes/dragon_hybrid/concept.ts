// The concept image request (prompt → image): generation is random, so the prompt, seed, size and
// model ARE the recipe; the PNG is a committed cache output (ADR 014) that the mesh request
// (surface.ts) names by its sha256. Re-roll: change the seed (or the prompt), run
// `t3d neural run recipes/dragon_hybrid/dragon_hybrid.ts`, READ the new image before the mesh model
// spends eight minutes on it (README.md, "Re-roll").

import type { NeuralRequests } from '@developerz.ai/ts23d';

/** The image model: Z-Image-Turbo (Tongyi-MAI, Apache-2.0) via the reference server's `z-image`
 *  plug-in, on a local GPU. */
export const CONCEPT_MODEL = 'z-image';

/** An exact side profile on all fours, wings raised clear of the back, tail straight out, flat
 *  light: what the skeleton fit needs (four separate legs, the spine in one plane, the wings off
 *  the trunk) and what the input-image rules ask. Seed 9 of the seeds tried. */
export const CONCEPT: NeuralRequests['image'] = {
  seed: 9,
  prompt:
    'A photoreal red western dragon standing on all fours like a monitor lizard, horizontal body, four strong legs, long neck stretched forward and slightly up, crimson scales, pale belly plates, two curved horns, one bat-like wing raised straight up above its back fully open, long tail straight out behind, exact side view in profile, seen from its left side, camera level with the body, orthographic-like, the animal facing left, head in line with the spine looking straight ahead, all four legs straight, vertical and evenly spaced, tail held straight out behind clear of the hind legs, mouth closed, neutral pose, full body in frame, plain light-grey studio background, flat even shadowless lighting, no shadows on background, sharp focus.',
  width: 1024,
  height: 1024,
  params: { template: 'raw' },
};
