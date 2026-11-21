// Where a slate roof loses and ages its slates (D593): wind lifts them at the exposed edges —
// the eaves course, under the ridge, along the verges — and once one goes its neighbours follow,
// so losses come in patches, not as an even sprinkle. A few patch centres per slope sit along
// those edges; a slate's odds rise with the edge it is near and the patch it is in. Where a slate
// is gone the roof shows dark sarking crossed by a timber batten.

import { box, dmath, type Mesh, type Rng, type Vec3 } from '@developerz.ai/ts23d';

/** A patch of wind damage on a slope: centre (u along the ridge, v down the slope), radius. */
export interface Patch {
  readonly u: number;
  readonly v: number;
  readonly r: number;
}

/** Two to four patches per slope, each on an exposed edge: eaves, ridge or a verge. */
export function windPatches(rng: Rng, ul: number, vl: number): Patch[] {
  const n = 2 + Math.floor(rng.next() * 3);
  return Array.from({ length: n }, () => {
    const edge = rng.next();
    const r = rng.range(0.8, 1.4);
    if (edge < 0.45) return { u: rng.range(0.5, ul - 0.5), v: vl - rng.range(0, 0.5), r };
    if (edge < 0.8) return { u: rng.range(0.5, ul - 0.5), v: rng.range(0.1, 0.6), r };
    const side = rng.next() < 0.5 ? rng.range(0, 0.4) : ul - rng.range(0, 0.4);
    return { u: side, v: rng.range(0.5, vl - 0.5), r: r * 1.2 };
  });
}

/**
 * How likely the slate at (u, v) is to be lost or aged, as a multiple of the slope's mean rate:
 * near zero in the open field, high inside a patch, raised along the eaves and ridge.
 */
export function wearOdds(patches: readonly Patch[], u: number, v: number, vl: number): number {
  let patch = 0;
  for (const p of patches) {
    const d = dmath.hypot(u - p.u, v - p.v) / p.r;
    if (d < 1) patch = Math.max(patch, (1 - d * d) * (1 - d * d));
  }
  const edge = Math.max(
    dmath.exp(-((vl - v) / 0.5) * ((vl - v) / 0.5)),
    dmath.exp(-(v / 0.4) * (v / 0.4)),
  );
  return 0.01 + 0.1 * edge + 10 * patch;
}

/** Bare sarking boards where a slate is gone, and the batten it hung on. */
const SARKING: Vec3 = [0.12, 0.085, 0.06];
const BATTEN: Vec3 = [0.36, 0.25, 0.14];

/**
 * What a lost slate leaves (local frame, base on the deck, centred on the slate's exposed face,
 * `w` × `l`): the dark sarking patch and a 50 mm batten across it.
 */
export function bareCourse(w: number, l: number): Mesh[] {
  return [
    box({ size: [w - 0.02, l, 0.004], color: SARKING, strip: 'oak' }),
    box({ size: [w + 0.04, 0.05, 0.025], color: BATTEN, strip: 'oak' }),
  ];
}
