// The bust's face rig (plan 101 slice 10): the landmarks `faceMorphs` needs, read off the skull
// stage (stomion = lip line, a TMJ just in front of the tragion, menton = chin, the jugular notch
// under the ribcage centre) or, for a primitive head, off the head block's landmarks.
// buildBust adds the morphs to `head` (and `bust`) and parents both to a `face` group so the GLB
// keeps one node for the clips: `defineAsset({ clips: headClips('face') })`.

import { type FaceRig, faceMorphs, type Mesh } from '@developerz.ai/ts23d';
import { skullLandmarks, skullOf } from '../face/skull.ts';
import type { BustRecipe } from './bust.ts';

export function faceRigOf(b: BustRecipe): FaceRig {
  const H = b.spec.H;
  const eye = { centre: b.eye.centre, r: b.eye.r, lid: b.eye.lid };
  if (b.skull) {
    const k = skullLandmarks(skullOf(b.skull, b.spec));
    const hinge: [number, number, number] = [
      k.tragion[0] + 0.012,
      k.tragion[1],
      k.tragion[2] - 0.01,
    ];
    return {
      eye,
      jaw: { hinge, chin: k.menton, lips: k.stomion[2] },
      chest: { centre: [k.jugular[0] - 0.08 * H, 0, k.jugular[2] - 0.45 * H], r: 0.55 * H },
    };
  }
  const { l } = b;
  return {
    eye,
    jaw: {
      hinge: [l.back + 0.55 * H, 0.4 * H, l.mz + 0.38 * H],
      chin: l.menton,
      lips: l.mz + 0.24 * H,
    },
    chest: { centre: [0, 0, l.mz - 0.75 * H], r: 0.55 * H },
  };
}

/** `head` and `bust` get the three morphs; other meshes pass through. */
export const withFace = (name: string, m: Mesh, rig: FaceRig): Mesh =>
  name === 'head' || name === 'bust' ? faceMorphs(m, rig) : m;
