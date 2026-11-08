// Head (upper): sculpted in the head-local frame (skull level, origin at the atlas) on a big-cat
// skull, then pitched into place with the head carriage. Block-out from separate masses
// (braincase, occiput, forehead, cheekbones, muzzle), the mouth cut at the lip line, then face.ts
// (planes and features), ruff.ts (winter ruff) and mask.ts (paint). The upper teeth are merged in.
// Ears, eyes and the jaw are separate parts (ears.ts, eyes.ts, jaw.ts).

import type { Field, Mesh, SculptEdit } from '@developerz.ai/ts23d';
import { merge, place } from '@developerz.ai/ts23d';
import { sculptPart } from '../_lib/creature/sculpt-part.ts';
import { faceFeatures, facePlanes } from './face.ts';
import { headPaint } from './mask.ts';
import { C } from './palette.ts';
import { ruffMasses, ruffTufts } from './ruff.ts';
import { HEAD, HEAD_PITCH, HEAD_SCALE } from './skeleton.ts';
import { upperTeeth } from './teeth.ts';

const M = HEAD.mouthZ;

/** Primary masses of the skull and face. */
export function blockOut(): SculptEdit[] {
  return [
    // Braincase with the temporal muscles: a broad low dome.
    { shape: 'ellipsoid', at: HEAD.cranium, size: [0.125, 0.098, 0.1], blend: 0 },
    // Occiput: the back of the skull and the neck's insertion.
    { shape: 'ellipsoid', at: [0.0, 0, 0.055], size: [0.075, 0.08, 0.085], blend: 0.04 },
    // Forehead between and above the eyes.
    { shape: 'ellipsoid', at: [0.172, 0, 0.096], size: [0.08, 0.096, 0.064], blend: 0.05 },
    // Cheeks: zygomatic arch + masseter, the head's widest point (mirrored).
    {
      shape: 'ellipsoid',
      at: [0.155, 0.08, -0.004],
      size: [0.09, 0.064, 0.064],
      blend: 0.05,
    },
    // Muzzle: short and broad, deep (cats are flat-faced).
    { shape: 'ellipsoid', at: [0.255, 0, -0.008], size: [0.085, 0.076, 0.058], blend: 0.05 },
  ];
}

/** The mouth: everything forward of the cheeks is cut at the lip line (the jaw closes on it). */
function mouthCut(): SculptEdit[] {
  return [
    {
      shape: 'roundBox',
      at: [0.285, 0, M - 0.08],
      size: [0.27, 0.13, 0.16],
      op: 'subtract',
      blend: 0.02,
      color: C.mouth,
    },
  ];
}

/** Ear bosses: the raised fur mounds on the crown each ear grows out of (no glued-on seam). */
function earBosses(): SculptEdit[] {
  const e = HEAD.ear;
  return [
    {
      shape: 'ellipsoid',
      at: [e[0] - 0.004, e[1], e[2] - 0.012],
      size: [0.034, 0.04, 0.03],
      blend: 0.03,
    },
  ];
}

export function headEdits(lod: number): SculptEdit[] {
  return [
    ...blockOut(),
    ...earBosses(),
    ...facePlanes(),
    ...ruffMasses(),
    ...mouthCut(),
    ...faceFeatures(lod),
    ...ruffTufts(lod),
  ];
}

export const HEAD_RES = [0.006, 0.013, 0.044] as const;

export interface HeadMeshes {
  /** Head-local mesh (skull, face, ruff, upper teeth), pitched about the atlas. */
  readonly mesh: Mesh;
  /** Head-local field (unpitched), for probes and tests. */
  readonly field: Field;
}

export function headMeshes(lod: 0 | 1 | 2): HeadMeshes {
  const s = sculptPart({
    edits: headEdits(lod),
    res: HEAD_RES[lod],
    color: C.orange,
    mirror: true,
    paint: headPaint(lod),
    tone: { reach: lod === 0 ? 0.02 : 0.035, strength: 0.75, edge: 0.15 },
    ...(lod === 2 ? { relief: { amp: 0.008, at: () => 0.008 } } : {}),
  });
  const local = merge([s.mesh, upperTeeth(lod)]);
  return { mesh: place(local, { pitch: HEAD_PITCH, scale: HEAD_SCALE }), field: s.field };
}
