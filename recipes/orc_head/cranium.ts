// The orc's cranium and nape structure over the warped base skull (D545, D546). The base vault is
// a smooth dome running straight into the trapezius, which read as an egg on a gourd; a heavy
// skull has planes and breaks. Here: the TEMPORAL planes (the vault's sides cut flat above the
// zygomatic arch, deepest behind the brow's outer end, so the forehead is narrower than the
// cheekbones and a temporal line stands between the plane and the crown), the OCCIPITAL crest
// (a ridge across the back of the skull where the neck muscles insert), the NUCHAL notch under
// it (the break between skull and neck, wrapping round to behind the ear) and the trapezius's
// front border from under the ear to the shoulder with the hollow over the collar bone in front
// of it, so the neck's flank is a muscle with an edge, not a ramp. Strokes lie on the stage-2 skin; left side, mirrored.

import type { SculptEdit } from '@developerz.ai/ts23d';
import { clayOn, creaseOn, norm, type Surface, type V } from '../_lib/bust/kit.ts';
import { segDist } from '../_lib/face/relief.ts';
import { SK } from './spec.ts';

/** The temporal plane: through this point above the ear, facing out, up and a little forward
 *  (so it cuts deepest at the forehead's side and runs out toward the back of the head). */
const TEMPORAL_AT: V = [0, 0.095, 0.5];
const TEMPORAL_N: V = norm([0.3, 0.95, 0.3]);

/** How far outside the temporal plane a point lies (metres, > 0 = cut away). */
export function temporalPlane(p: V): number {
  return (
    (p[0] - TEMPORAL_AT[0]) * TEMPORAL_N[0] +
    (Math.abs(p[1]) - TEMPORAL_AT[1]) * TEMPORAL_N[1] +
    (p[2] - TEMPORAL_AT[2]) * TEMPORAL_N[2]
  );
}

/** The nuchal notch's line: midline of the nape round to behind the ear lobe. */
export const NUCHAL: readonly V[] = [
  [-0.125, 0, 0.432],
  [-0.105, 0.05, 0.43],
  [-0.065, 0.08, 0.42],
  [-0.03, 0.09, 0.405],
];

export function craniumEdits(s: Surface): SculptEdit[] {
  return [
    // Temporal planes: everything outside the plane goes, but the ear's blade (it stands 4 cm
    // out through the plane) keeps a 3 cm sleeve.
    {
      field: (p) => Math.max(-temporalPlane(p), 0.03 - segDist(p, SK.earTop, SK.earTip)),
      bounds: [
        [-0.07, 0.02, 0.485],
        [0.14, 0.16, 0.62],
      ],
      op: 'subtract',
      blend: 0.03,
    },
    // Occipital crest: the ridge the trapezius and the nuchal ligament hang from.
    clayOn(
      s,
      [
        [-0.11, 0, 0.47],
        [-0.095, 0.045, 0.468],
        [-0.06, 0.075, 0.458],
      ],
      0.016,
      0.007,
      { blend: 0.02, tips: 0.5 },
    ),
    // Nuchal notch: the skull ends, the neck begins.
    creaseOn(s, NUCHAL, 0.016, 0.013, { blend: 0.02, tips: 0.6 }),
    // The trapezius's front border, from under the ear down to the shoulder's point.
    creaseOn(
      s,
      [
        [-0.03, 0.098, 0.395],
        [-0.045, 0.14, 0.355],
        [-0.04, 0.185, 0.325],
      ],
      0.014,
      0.009,
      { blend: 0.016, tips: 0.4 },
    ),
    // The hollow in front of that border, over the collar bone (the supraclavicular fossa):
    // the trapezius then stands as a ridge behind it and the neck as a column in front.
    {
      shape: 'ellipsoid',
      at: s.off([0.0, 0.125, 0.335], 0.012),
      size: [0.034, 0.03, 0.028],
      op: 'subtract',
      blend: 0.03,
    },
  ];
}
