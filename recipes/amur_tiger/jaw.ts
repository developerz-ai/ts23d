// Lower jaw (head-local frame, closed; jawMesh opens it about the hinge): the mandible narrowing to
// a deep, square chin, the black lower lip, the white chin fur and beard hanging under it, a pink
// tongue on the mouth floor, the lower canines and incisors. Its own part pivoted at the hinge
// (temporomandibular joint) so an engine can open it; at rest it hangs a few degrees open.

import type { Mesh, SculptEdit } from '@developerz.ai/ts23d';
import { merge, place } from '@developerz.ai/ts23d';
import { mixRgb, smoothstep } from '../_lib/creature/curve.ts';
import { sculptPart } from '../_lib/creature/sculpt-part.ts';
import { skin } from '../_lib/creature/skin.ts';
import { C } from './palette.ts';
import { HEAD, HEAD_PITCH, HEAD_SCALE } from './skeleton.ts';
import { lowerTeeth } from './teeth.ts';

const M = HEAD.mouthZ;
const H = HEAD.hinge;

export function jawEdits(lod: number): SculptEdit[] {
  const out: SculptEdit[] = [
    // Mandible: hinge to chin, deep at the back (masseter), narrow and deep at the front.
    skin(
      [
        { at: [H[0] + 0.01, 0.045, H[2] - 0.01], r: 0.028 },
        { at: [0.17, 0.042, M - 0.026], r: 0.026 },
        { at: [0.25, 0.032, M - 0.028], r: 0.024 },
        { at: [0.29, 0.018, M - 0.03], r: 0.022 },
      ],
      { blend: 0.02 },
    ),
    // Chin: square and deep, joining both halves.
    { shape: 'ellipsoid', at: [0.282, 0, M - 0.032], size: [0.03, 0.038, 0.03], blend: 0.02 },
    // Lower lip: black rim along the mandible's top edge.
    skin(
      [
        { at: [0.305, 0.008, M - 0.008], r: 0.0075 },
        { at: [0.285, 0.03, M - 0.01], r: 0.008 },
        { at: [0.235, 0.044, M - 0.01], r: 0.008 },
        { at: [0.17, 0.048, M - 0.006], r: 0.007 },
      ],
      { blend: 0.008, color: C.lip },
    ),
    // Mouth floor: cut the top flat at the lip line, dark inside.
    {
      shape: 'roundBox',
      at: [0.2, 0, M + 0.05],
      size: [0.24, 0.07, 0.1],
      op: 'subtract',
      blend: 0.008,
      color: C.mouth,
    },
    // Chin fur and the beard hanging under the jaw (white, winter-long).
    {
      shape: 'ellipsoid',
      at: [0.21, 0, M - 0.06],
      size: [0.085, 0.045, 0.026],
      rotate: [0, -8, 0],
      blend: 0.032,
    },
  ];
  // Tongue: only where the mouth can be seen into.
  if (lod < 2)
    out.push({
      shape: 'ellipsoid',
      at: [0.215, 0, M - 0.006],
      size: [0.07, 0.03, 0.01],
      blend: 0.006,
      color: C.tongue,
    });
  return out;
}

/** Jaw colour: white fur outside, black lip line, dark mouth, pink tongue (edit colours). */
function jawPaint(p: readonly [number, number, number], c: readonly [number, number, number]) {
  const lipish = Math.abs(c[0] - C.orange[0]) + Math.abs(c[1] - C.orange[1]) > 0.05;
  // A dark spot behind the lower lip on each side (photos), the rest white.
  const spot =
    smoothstep(0.012, 0.006, Math.hypot(p[0] - 0.262, p[2] - (M - 0.024))) *
    smoothstep(0.03, 0.04, Math.abs(p[1]));
  const fur = mixRgb(C.white, C.stripe, spot * 0.9);
  return lipish
    ? mixRgb(fur, [c[0], c[1], c[2]], 0.9)
    : mixRgb(fur, C.whiteShade, smoothstep(M - 0.04, M - 0.09, p[2]) * 0.4);
}

export const JAW_RES = [0.006, 0.013, 0.03] as const;

/** The jaw about its hinge, opened by HEAD.open and pitched with the head. */
export function jawMesh(lod: 0 | 1 | 2): Mesh {
  const m = sculptPart({
    edits: jawEdits(lod),
    res: JAW_RES[lod],
    color: C.orange,
    mirror: true,
    paint: jawPaint,
    tone: { reach: 0.015, strength: 0.6 },
  }).mesh;
  const local = merge([m, lowerTeeth(lod)]);
  return place(place(local, { at: [-H[0], -H[1], -H[2]] }), {
    pitch: HEAD_PITCH + (HEAD.open * Math.PI) / 180,
    scale: HEAD_SCALE,
  });
}
