// Eyes: amber eyeballs set deep in the sculpted orbit (the head's `eye_socket` parts, under the
// brow overhang, wrapped by a heavy upper lid and a scaled lower lid), each its own part pivoted at
// the eyeball centre so an engine can aim it. Vertical slit pupil; the iris is ember at its dark
// rim, lighter toward the centre. Glossy: the satin `plastic` strip (low roughness). Built gazing
// along local +X, then turned forward-ish (a predator's mostly-forward gaze).

import { type Mesh, place, sdf, type Vec3 } from '@developerz.ai/ts23d';
import { mixRgb, smoothstep } from '../_lib/creature/curve.ts';
import { blob } from '../_lib/creature/lowpoly.ts';
import { C } from './palette.ts';

export const EYE_R = 0.062;
/** Rest gaze yaw (radians) for the left eye; the right eye mirrors it. */
export const GAZE_YAW = 0.45;

/** Eyeball centred on the origin, gaze turned by `yaw`. */
export function eyeMesh(lod: 0 | 1 | 2, yaw: number): Mesh {
  const r = EYE_R;
  if (lod === 2)
    return place(
      blob([0, 0, 0], [r, r, r], {
        rings: 4,
        sides: 6,
        color: (n) => (n[0] > 0.8 ? C.pupil : mixRgb(C.iris, C.eye, smoothstep(0.3, 0.9, n[0]))),
      }),
      { yaw },
    );
  const res = [r / 7, r / 3][lod] ?? r / 3;
  const ball = sdf({
    field: (q) => Math.hypot(q[0], q[1], q[2]) - r,
    bounds: [
      [-r * 1.3, -r * 1.3, -r * 1.3],
      [r * 1.3, r * 1.3, r * 1.3],
    ],
    resolution: res,
    color: (q): Vec3 => {
      const l = Math.hypot(q[0], q[1], q[2]) || 1;
      const cos = q[0] / l;
      // Slit: narrow in local Y, tall in Z.
      const slit = Math.abs(q[1] / l) < 0.09 * (1 - Math.abs(q[2] / l) * 0.8) && cos > 0.7;
      if (slit) return C.pupil;
      // Dark limbal rim → ember iris → light centre around the slit.
      const rim = smoothstep(0.3, 0.45, cos);
      const centre = smoothstep(0.6, 0.97, cos);
      return mixRgb(mixRgb(C.pupil, C.iris, 0.35 + 0.65 * rim), C.eye, centre);
    },
    strip: 'plastic',
  });
  return place(ball, { yaw });
}
