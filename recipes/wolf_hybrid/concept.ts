// The concept image request (prompt → image): AI generation is random, so the prompt, negative
// prompt, seed, size and model ARE the recipe; the image is a committed cache output (ADR 014)
// that the surface request (surface.ts) names by its sha256. Re-roll: change the seed (or the
// prompt / model), `t3d neural run recipes/wolf_hybrid/wolf_hybrid.ts`, READ the new image and the
// hero, commit recipes/wolf_hybrid/neural/. Written in the shape `t3d concept` writes.

import type { NeuralRequests } from '@developerz.ai/ts23d';

/** The image model: Z-Image-Turbo (Tongyi-MAI, Apache-2.0) via the reference server's `z-image`
 *  plug-in (9 steps, guidance 0). `t3d concept`'s CPU `renderAdapter` ('ts23d-render') answers
 *  the same request shape without a GPU (the code wolf on white). */
export const CONCEPT_MODEL = 'z-image';

/** ¾ front view, full body, plain light-grey background: passes the input-image rules
 *  (background, one subject, fill, not cropped, ≥ 512 px, sharp). Seed 42 won the A/B (lab
 *  out/best/AB.md): one wolf, clean matte, legs and tail in frame. */
export const CONCEPT: NeuralRequests['image'] = {
  seed: 42,
  prompt:
    'A photoreal adult grey wolf (Canis lupus), standing, full body in frame, plain light-grey studio background, soft even light, no shadows on background, sharp focus, 3/4 front view.',
  width: 1024,
  height: 1024,
  params: { template: 'raw' },
};
