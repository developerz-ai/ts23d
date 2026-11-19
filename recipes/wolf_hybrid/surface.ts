// The model half of the wolf: five cached requests in a chain (ADR 014, kinds `modelChain`), each
// naming the previous output by its sha256.
//   image   CONCEPT (concept.ts)                → PNG, committed
//   mesh    SURFACE on that image (Pixal3D)     → the raw textured mesh, ~0.9 M triangles, 60–100 MB,
//                                                 kept local (never in git)
//   blender PROXY: clean → 6 000-triangle shell → a small GLB, committed: the geometry TS registers
//                                                 the model on and fits the skeleton into
//   rig     UniRig on the proxy                 → its joints, committed: where hips, stifles,
//                                                 elbows and the spine lie (mapped by topology)
//   blender FINAL: transform(fit) + steps.ts    → the game mesh: three LODs, PNG maps, the skin;
//                                                 committed, the only thing a build draws
// The chain is `required`: the code creature of this spec fails QA (over 100 000 triangles at
// LOD 0, off the sourced box), so `t3d build` with an output missing stops with one
// T3D_NEURAL_MISSING and never ships it. A compile with no cache provided at all (a test, the
// gallery's CPU tier) still gets null: the code wolf (wolf_hybrid.ts). Nothing here calls a model;
// `t3d neural run` does, on a machine with a GPU and Blender (README.md).

import {
  type BuildContext,
  type ChainedModel,
  modelChain,
  type NeuralRequests,
} from '@developerz.ai/ts23d';
import { CONCEPT, CONCEPT_MODEL } from './concept.ts';
import { WOLF } from './spec.ts';
import { steps, TRIANGLES } from './steps.ts';

/** The mesh model (MIT): Pixal3D. */
export const SURFACE_MODEL = 'pixal3d';
/** The learned rigger (MIT): UniRig, run on the 6 000-triangle proxy. */
export const RIG_MODEL = 'unirig';

/** The image-to-3D request, minus the image (the concept's sha256, filled in by the chain):
 *  Pixal3D's best quality (1536 cascade, 25 steps per sampler, 1 M-face target, 4096 texture). */
export const SURFACE: Omit<NeuralRequests['mesh'], 'image'> = {
  seed: 42,
  maxTriangles: 1_000_000,
  params: { resolution: 1536, steps: 25, triangles: 1_000_000, texture_size: 4096 },
};

/** Creature clips this body does not play (README.md, "Clips"): the gallop streams the tail out
 *  behind, and this model's tail was generated lying on the rump and hocks. */
export const DROPPED: readonly string[] = ['gallop'];

/** The imported game mesh with the rig it was built for; null with no cache provided
 *  and while `t3d neural run` is still filling the cache; an offline (build) cache throws
 *  `T3D_NEURAL_MISSING` on a miss instead. */
export const wolfModel = (ctx: BuildContext): ChainedModel | null =>
  modelChain(ctx, {
    concept: CONCEPT,
    surface: SURFACE,
    spec: WOLF,
    steps,
    repose: true,
    rig: RIG_MODEL,
    drop: DROPPED,
    maxTriangles: TRIANGLES[0],
    models: { image: CONCEPT_MODEL, mesh: SURFACE_MODEL },
    license: 'MIT',
    required: true,
    author:
      'ts23d wolf_hybrid recipe (Z-Image concept, Pixal3D mesh, UniRig joints, Blender steps)',
  });
