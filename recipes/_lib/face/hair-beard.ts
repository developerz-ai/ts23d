// The beard's body for the face busts: a spade of hair hanging from the chin and jaw — three
// tapering lock chains from warped landmarks that blend into one volume, for the beard locks to
// lie on (a beard is a mass before it is locks).

import type { SculptEdit, Vec3 } from '@developerz.ai/ts23d';
import { lock } from '../bust/hair.ts';
import type { FaceHead } from './head.ts';
import { LEFT, MIDLINE } from './landmarks.ts';

/** The beard's body: a spade of hair hanging from the chin and jaw (three tapering chains that
 *  blend into one volume), for the locks to lie on — a beard is a mass before it is locks. */
export function beardBody(head: FaceHead, root: Vec3, tip: Vec3, lod: number): SculptEdit[] {
  const s = head.scale;
  const pog = head.map(MIDLINE.pogonion);
  const men = head.map(MIDLINE.menton);
  const jaw = head.map(LEFT.jawline);
  const out: SculptEdit[] = [];
  const n = lod === 2 ? 4 : 8;
  const chain = (a: Vec3, r0: number): void => {
    const pts: Vec3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([
        a[0] + 0.01 * s * t - 0.02 * s * t * t,
        a[1] * (1 - 0.55 * t),
        a[2] - 0.13 * s * t,
      ]);
    }
    out.push(...lock(pts, r0 * s, 0.01 * s, root, tip, { mirror: false, belly: 0.004 * s }));
  };
  chain([pog[0] - 0.012 * s, 0, (pog[2] + men[2]) / 2], 0.03);
  for (const side of [1, -1])
    chain([jaw[0], side * Math.abs(jaw[1]) * 0.9, jaw[2] - 0.004 * s], 0.024);
  return out;
}
