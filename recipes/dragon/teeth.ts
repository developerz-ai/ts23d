// Teeth: full rows rooted in the gum lines of both jaws, conical and slightly recurved toward the
// throat, graded from small at the back to large at the front, with two pairs of fangs per jaw
// that dominate (not an even comb). Lower teeth sit half a spacing off the upper ones, so the rows
// interlock. Colour yellows toward the root. LOD0: full rows · LOD1: every other tooth, larger ·
// LOD2: fangs only.

import { type Mesh, merge, place, type Vec3 } from '@developerz.ai/ts23d';
import { v3 } from '../_lib/creature/curve.ts';
import { type HornOptions, hornTube } from '../_lib/creature/horn.ts';
import { TOOTH } from './palette.ts';

export interface ToothRow {
  /** First and last tooth x (in the row's frame) and the count at LOD0. */
  readonly x0: number;
  readonly x1: number;
  readonly n: number;
  /** Indices of the fangs. */
  readonly fangs: readonly number[];
  /** Gum line: half-width at x, and its height. */
  readonly width: (x: number) => number;
  readonly z: number;
  /** +1: teeth stand up (lower jaw) · −1: hang down (upper). */
  readonly up: 1 | -1;
}

/** Spacing of a row's teeth. */
export const toothStep = (r: ToothRow): number => (r.x1 - r.x0) / (r.n - 1);

function teeth(r: ToothRow, lod: number): HornOptions[] {
  const segs = [6, 4, 3][lod] ?? 3;
  const out: HornOptions[] = [];
  for (let i = 0; i < r.n; i++) {
    const fang = r.fangs.includes(i);
    if (lod === 2 && !fang) continue;
    if (lod === 1 && !fang && i % 2 === 1) continue;
    const x = r.x0 + i * toothStep(r);
    const t = i / (r.n - 1);
    const grow = lod === 1 && !fang ? 1.3 : 1;
    const len = (fang ? 0.15 : 0.045 + 0.04 * t) * grow;
    const rad = (fang ? 0.034 : 0.016 + 0.008 * t) * grow;
    // Rooted 3 cm deep in the gum, just inside the lip; leaning out a little.
    const base: Vec3 = [x, r.width(x) - 0.03, r.z - r.up * 0.03];
    const dir: Vec3 = [0.06, 0.12, r.up];
    out.push({
      base,
      dir,
      length: len + 0.03,
      radius: rad,
      tip: [0.003, 0.006, 0.015][lod] ?? 0.015,
      axis: v3.cross(v3.norm(dir), [-1, 0, 0]),
      bend: fang ? 20 : 12,
      segments: segs,
      taper: 0.9,
      colors: TOOTH,
    });
  }
  return out;
}

/** Upper row: hangs from the palate edge (world frame). */
export const UPPER: ToothRow = {
  x0: 2.56,
  x1: 3.5,
  n: 10,
  fangs: [3, 8],
  width: (x) => 0.2 - 0.115 * Math.min(1, Math.max(0, (x - 2.6) / 1.06)),
  z: 3.14,
  up: -1,
};

export const upperTeeth = (lod: number): HornOptions[] => teeth(UPPER, lod);

/** Lower row in the jaw's hinge frame (closed, mouth line z = 0): offset half a step so the
 *  rows interlock. */
export function lowerTeeth(
  lod: number,
  hingeX: number,
  width: (x: number) => number,
): HornOptions[] {
  const step = toothStep(UPPER);
  return teeth(
    {
      x0: UPPER.x0 - hingeX + step / 2,
      x1: UPPER.x1 - hingeX - step / 2,
      n: UPPER.n - 1,
      fangs: [2, 7],
      width,
      z: -0.005,
      up: 1,
    },
    lod,
  );
}

/** Teeth as banded tubes, both sides (a sculpt would need 5 mm cells). */
export function teethMesh(specs: readonly HornOptions[], lod: 0 | 1 | 2): Mesh {
  const left = merge(specs.map((o) => hornTube(o, [8, 5, 4][lod] ?? 4)));
  return merge([left, place(left, { scale: [1, -1, 1] })]);
}
