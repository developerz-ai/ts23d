// Weathered slates cluster where wind gets under them (D593): at the eaves, under the ridge and
// in patches, not as grey squares sprinkled evenly over the slope. Measured on the slates the
// roof actually loses or ages: a Clark–Evans nearest-neighbour ratio on the median distance (≈ 1
// random, < 1 clustered; the median, so one stray slate cannot swing it) and the share within 1.2 m of the eaves or the ridge. Failure first: the same number
// of slates sprinkled uniformly fails both.

import { describe, expect, it } from 'bun:test';
import { createRng, dmath } from '@developerz.ai/ts23d';
import { HALF_X, HALF_Y } from './plan.ts';
import { OVERHANG, PITCH, roofSlopes } from './roof.ts';

const UL = (HALF_X + OVERHANG) * 2;
const VL = (HALF_Y + OVERHANG) / dmath.cos(PITCH);

/** Clark–Evans ratio: median nearest-neighbour distance ÷ the mean expected for a random set. */
function clarkEvans(pts: readonly [number, number][]): number {
  const nn = pts.map((p, i) =>
    Math.min(...pts.filter((_, j) => j !== i).map((q) => dmath.hypot(p[0] - q[0], p[1] - q[1]))),
  );
  const sorted = [...nn].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  return median / (0.5 * Math.sqrt((UL * VL) / pts.length));
}

const edgeShare = (pts: readonly [number, number][]): number =>
  pts.filter(([, v]) => v < 1.2 || v > VL - 1.2).length / pts.length;

const clustered = (pts: readonly [number, number][]): boolean =>
  clarkEvans(pts) < 0.7 && edgeShare(pts) >= 0.55;

const weathered = (seed: number): [number, number][] => {
  const fates: [number, number][] = [];
  roofSlopes(0, 1, [], createRng(seed), undefined, fates);
  return fates;
};

describe('weathered slates', () => {
  it('fails an even sprinkle of the same count', () => {
    const n = weathered(1).length;
    const rng = createRng(99);
    const even = Array.from({ length: n }, (): [number, number] => [
      rng.range(0, UL),
      rng.range(0, VL),
    ]);
    expect(clustered(even)).toBe(false);
  });

  for (const seed of [1, 2, 3, 4])
    it(`seed ${seed}: cluster at the eaves, the ridge and in patches`, () => {
      const pts = weathered(seed);
      expect(pts.length).toBeGreaterThanOrEqual(8);
      expect(clarkEvans(pts)).toBeLessThan(0.7);
      expect(edgeShare(pts)).toBeGreaterThanOrEqual(0.55);
    });
});
