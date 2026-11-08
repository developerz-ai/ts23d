// Where the hair goes, as lines: base points pushed through the face's warp, so one style fits
// every race. Scalp flow lines (hairline → crown → occiput), ribbons falling behind the ears to
// the shoulders, beard locks down the jaw and the moustache. hair.ts sculpts along them; the
// recipes declare their grooves as intended creases from the same lines.

import type { Vec3 } from '@developerz.ai/ts23d';
import { spline } from '../bust/kit.ts';
import type { FaceHead } from './head.ts';
import { LEFT, MIDLINE } from './landmarks.ts';
import { skinPoint } from './skin-ray.ts';

export interface HairStyle {
  readonly cut: 'none' | 'short' | 'long' | 'crest';
  readonly beard?: 'none' | 'full';
  readonly root: Vec3;
  readonly tip: Vec3;
}

/** The head centre the hair is cast from. */
export const hairCentre = (head: FaceHead): Vec3 => head.map([0.045, 0, 0.75]);

/** Scalp flow lines ON the skin, front hairline → over the crown → down the back: meridians
 *  turned `deg` about the front–back axis (0 = the parting line), elevation `from` → `to`. */
export function scalpLines(head: FaceHead, degs: readonly number[], from = 34, to = 205): Vec3[][] {
  const c = hairCentre(head);
  const n = 12;
  return degs.map((deg) => {
    const phi = (deg * Math.PI) / 180;
    const pts: Vec3[] = [];
    for (let i = 0; i <= n; i++) {
      const e = ((from + ((to - from) * i) / n) * Math.PI) / 180;
      pts.push(
        skinPoint(head.mesh, c, [
          Math.cos(e),
          Math.sin(e) * Math.sin(phi),
          Math.sin(e) * Math.cos(phi),
        ]),
      );
    }
    return pts;
  });
}

/** Ribbons falling from behind the ears and the back of the head to the shoulders. */
export function fallLines(head: FaceHead): { pts: Vec3[]; facing: Vec3 }[] {
  const out: { pts: Vec3[]; facing: Vec3 }[] = [];
  const s = head.scale;
  for (const side of [1, -1])
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      // Round the head from just behind the ear (t = 0) toward the back (t = 1).
      const a = head.map([
        LEFT.earBack[0] - 0.022 - t * 0.045,
        side * (LEFT.euryon[1] + 0.004 - t * t * 0.045),
        LEFT.earTop[2] - 0.004 - t * 0.008,
      ]);
      const out1: Vec3 = [a[0] - 0.012 * s, a[1] * 1.12, a[2] - 0.07 * s];
      out.push({
        pts: spline(
          [
            a,
            out1,
            [a[0] - 0.016 * s, a[1] * 1.18, a[2] - 0.15 * s],
            [a[0] - 0.006 * s, a[1] * 1.3, a[2] - 0.22 * s],
          ],
          12,
        ),
        facing: [-0.4 * t, side * (1 - t), 0],
      });
    }
  return out;
}

/** Beard locks hanging from the jaw and chin. */
export function beardLines(head: FaceHead): Vec3[][] {
  const s = head.scale;
  const menton = head.map(MIDLINE.menton);
  const pog = head.map(MIDLINE.pogonion);
  const out: Vec3[][] = [];
  for (let i = -3; i <= 3; i++) {
    const ang = (i / 3) * 1.25;
    const a: Vec3 = [
      pog[0] - 0.006 * s - 0.05 * s * (1 - Math.cos(ang)),
      0.05 * s * Math.sin(ang),
      (pog[2] + menton[2]) / 2 + 0.01 * s * Math.abs(Math.sin(ang)),
    ];
    const len = (0.13 - 0.03 * Math.abs(i / 3)) * s;
    out.push(
      spline(
        [
          a,
          [a[0] + 0.012 * s, a[1] * 0.92, a[2] - len * 0.4],
          [a[0] + 0.004 * s, a[1] * 0.75, a[2] - len * 0.8],
          [a[0] - 0.004 * s, a[1] * 0.6, a[2] - len],
        ],
        10,
      ),
    );
  }
  return out;
}

/** The two moustache locks, from under the nose drooping past the lip corners. */
export function moustacheLines(head: FaceHead): Vec3[][] {
  const s = head.scale;
  const sub = head.map(MIDLINE.subnasale);
  const lip = head.map(MIDLINE.labraleSup);
  const corner = head.map(LEFT.cheilion);
  return [1, -1].map((side) =>
    spline(
      [
        [sub[0] - 0.002 * s, side * 0.004 * s, sub[2] - 0.004 * s],
        [lip[0] + 0.004 * s, side * Math.abs(corner[1]) * 0.7, lip[2] + 0.001 * s],
        [corner[0] + 0.002 * s, side * Math.abs(corner[1]) * 1.25, corner[2] - 0.012 * s],
        [corner[0] - 0.004 * s, side * Math.abs(corner[1]) * 1.35, corner[2] - 0.035 * s],
      ],
      10,
    ),
  );
}
