// Eyes: the shared bust eyeball (../_lib/bust/eye.ts) with the tiger's spec (face.ts `EYE`): a
// round black pupil in a big amber iris that fills nearly the whole visible eye, set forward
// (binocular) and converging on a point ahead, seated in the sculpted orbit under the lids. Each
// its own part pivoted at the ball centre, pitched with the head. Far LOD: a low-poly ball.

import type { Mesh, Vec3 } from '@developerz.ai/ts23d';
import { place } from '@developerz.ai/ts23d';
import { eyeball } from '../_lib/bust/eye.ts';
import { mixRgb, smoothstep } from '../_lib/creature/curve.ts';
import { blob } from '../_lib/creature/lowpoly.ts';
import { EYE } from './face.ts';
import { C } from './palette.ts';
import { HEAD_PITCH, HEAD_SCALE } from './skeleton.ts';

/** Yaw (radians) that turns the left eye's gaze onto the shared gaze point (head-local). */
export function gazeYaw(side: 1 | -1): number {
  const c = EYE.centre;
  const g: Vec3 = EYE.gaze ?? [c[0] + 1.5, 0, c[2]];
  return Math.atan2(g[1] - c[1] * side, g[0] - c[0]);
}

/** The eyeball about its centre, gazing at the gaze point, pitched with the head. */
export function eyeMesh(lod: 0 | 1 | 2, side: 1 | -1): Mesh {
  const r = EYE.r;
  const ball =
    lod === 2
      ? blob([0, 0, 0], [r, r, r], {
          rings: 4,
          sides: 6,
          color: (n) =>
            n[0] > 0.7 ? C.pupil : mixRgb(C.irisRim, C.iris, smoothstep(0.2, 0.6, n[0])),
        })
      : eyeball(EYE, lod === 0 ? r / 6 : r / 3);
  return place(place(ball, { yaw: gazeYaw(side) }), { pitch: HEAD_PITCH, scale: HEAD_SCALE });
}
