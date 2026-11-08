// What sits in the mouth: an upper and a lower tooth row (an arch of rounded incisors and canines
// set just behind the warped lips, showing between them where the base's lips part), and for an
// orc the tusks — curved tapered cones rooted in the lower jaw behind the lip corners, rising
// outside the upper lip. Positions come from the face's warp, so they follow every race.

import { type Mesh, merge, sweep, type Vec3 } from '@developerz.ai/ts23d';
import type { FaceHead } from './head.ts';
import { LEFT, MIDLINE } from './landmarks.ts';

const IVORY: Vec3 = [0.86, 0.82, 0.7];
const TUSK: Vec3 = [0.85, 0.79, 0.62];

/** A rounded tooth: a short tapered sweep along `dir` from `root`. */
function tooth(root: Vec3, dir: Vec3, len: number, r: number, color: Vec3, seg: number): Mesh {
  const path: Vec3[] = [];
  const scale: number[] = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    path.push([root[0] + dir[0] * len * t, root[1] + dir[1] * len * t, root[2] + dir[2] * len * t]);
    scale.push(1 - 0.35 * t * t);
  }
  return sweep({
    section: { radius: r, segments: seg },
    path,
    scale,
    color,
    strip: 'plain',
    caps: true,
  });
}

/** Upper and lower tooth rows following the warped mouth (base points mapped through the warp). */
export function teethRows(head: FaceHead, lod: number): Mesh {
  const sup = head.map(MIDLINE.labraleSup);
  const inf = head.map(MIDLINE.labraleInf);
  const cl = head.map(LEFT.cheilion);
  const s = head.scale;
  const mid: Vec3 = [(sup[0] + inf[0]) / 2, 0, (sup[2] + inf[2]) / 2];
  const halfW = Math.abs(cl[1]) * 0.78;
  const seg = lod === 0 ? 8 : 5;
  const out: Mesh[] = [];
  const n = lod === 0 ? 5 : 3;
  for (const [row, dz] of [
    [0, 1],
    [1, -1],
  ] as const) {
    for (let i = -n; i <= n; i++) {
      if (i === 0) continue;
      const t = (Math.abs(i) - 0.5) / n;
      const y = Math.sign(i) * halfW * t;
      // Arch: teeth sit further back toward the corners.
      const x = mid[0] - 0.007 * s - 0.012 * s * t * t;
      const zRoot = mid[2] + dz * 0.0075 * s;
      const len = (row === 0 ? 0.0085 : 0.0075) * s * (1 - 0.25 * t);
      const r = (halfW / n / 2) * 0.95 * (1 - 0.2 * t);
      out.push(tooth([x, y, zRoot], [0.05, 0, -dz], len, r, IVORY, seg));
    }
  }
  return merge(out);
}

/** Orc tusks: from inside the lower jaw at the canine, curving up and out past the upper lip. */
export function tusks(head: FaceHead, length: number, lod: number): { l: Mesh; r: Mesh } {
  const inf = head.map(MIDLINE.labraleInf);
  const cl = head.map(LEFT.cheilion);
  const s = head.scale;
  const L = (length * 0.2336 + 0.008) * s;
  const make = (side: 1 | -1): Mesh => {
    const root: Vec3 = [inf[0] - 0.016 * s, side * Math.abs(cl[1]) * 0.62, inf[2] - 0.014 * s];
    const path: Vec3[] = [];
    const scale: number[] = [];
    const n = lod === 0 ? 10 : 5;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // Up, forward out of the lip, and a little outward; the tip curls back.
      path.push([
        root[0] + L * (0.42 * t - 0.12 * t * t),
        root[1] + side * L * 0.22 * t * t,
        root[2] + L * t,
      ]);
      scale.push(Math.max(0.08, 1 - t ** 1.4));
    }
    return sweep({
      section: { radius: 0.0062 * s * Math.max(1, length / 0.12), segments: lod === 0 ? 12 : 6 },
      path,
      scale,
      color: TUSK,
      strip: 'plain',
      caps: true,
    });
  };
  return { l: make(1), r: make(-1) };
}
