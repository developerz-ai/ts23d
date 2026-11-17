// The model half of the ranger: four cached requests in a chain (ADR 014, kinds `riggedChain`),
// each naming the previous output by its sha256.
//   image   CONCEPT (concept.ts)            → PNG, committed
//   mesh    SURFACE on that image (Meshy)   → textured a-pose GLB, ~22 MB, kept local
//   rig     RIG on that mesh (Meshy)        → the same mesh skinned to 24 bones + three clips,
//                                             ~29 MB, kept local
//   blender STEPS (steps.ts) on the rigged  → the game mesh: three LODs, PNG maps, the skin and
//                                             the clips; committed, the only thing a build reads
// Local outputs (`keep: 'local'`) never enter git: record.json commits their sha256, so a fresh
// clone resolves the whole chain from the committed Blender output. A miss anywhere returns
// null: the CPU mannequin (mannequin.ts). Meshy is a hosted, paid service (credits per request,
// no seed: a re-run is a new sample); nothing here calls it, `t3d neural run` does.

import {
  type BuildContext,
  type ImportedModel,
  type NeuralRequests,
  riggedChain,
} from '@developerz.ai/ts23d';
import { CONCEPT, CONCEPT_MODEL } from './concept.ts';
import { STEPS, TRIANGLES } from './steps.ts';

/** Stature of the figure, metres: the rig request scales its skeleton by it, the import fits to it. */
export const HEIGHT = 1.78;

/** The image-to-3D model, pinned so a record names a version, not 'latest'. */
export const SURFACE_MODEL = 'meshy-7.1';
/** Meshy's rigging + animation service. */
export const RIG_MODEL = 'meshy-rigging';

/** The image-to-3D request, minus the image: re-posed to an a-pose, remeshed under the rigging
 *  service's 380 k triangle limit, textured at 2K with PBR maps. Meshy has no seed. */
export const SURFACE: Omit<NeuralRequests['mesh'], 'image'> = {
  seed: 0,
  pose: 'a-pose',
  maxTriangles: 300_000,
  params: { texture: true, pbr: true, textureResolution: '2k' },
};

/** The rig request, minus the mesh: clips are names in Meshy's animation library, in the order
 *  the output carries them. */
export const RIG: Omit<NeuralRequests['rig'], 'mesh'> = {
  seed: 0,
  height: HEIGHT,
  clips: ['Idle', 'Casual Walk', 'Run 2'],
};

/** The imported game mesh (three LODs, one texture set, armature, clips), or null on any miss. */
export const rangerModel = (ctx: BuildContext): ImportedModel | null =>
  riggedChain(ctx, {
    concept: CONCEPT,
    surface: SURFACE,
    rig: RIG,
    steps: STEPS,
    maxTriangles: TRIANGLES[0],
    models: { image: CONCEPT_MODEL, mesh: SURFACE_MODEL, rig: RIG_MODEL },
    seed: 1,
    license: 'own',
    author: 'ts23d ranger recipe (Meshy image-to-3D and rigging, Blender steps)',
  });
