import { describe, expect, it } from 'bun:test';
import type { Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import { similarityToward } from './similarity-blend.ts';
import {
  applySimilarity,
  composeSimilarity,
  type Similarity,
  yawSimilarity,
} from './similarity-fit.ts';

const near = (a: Vec3, b: Vec3): number => dmath.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const tilt: Similarity = {
  s: 1,
  r: [1, 0, 0, 0, dmath.cos(0.4), -dmath.sin(0.4), 0, dmath.sin(0.4), dmath.cos(0.4)],
  t: [0, 0, 0],
};
const m: Similarity = {
  ...composeSimilarity(yawSimilarity(70), tilt),
  s: 1.3,
  t: [0.2, -0.1, 0.05],
};
const probe: Vec3[] = [
  [0.3, 0.1, 0.8],
  [-1, 2, 0.5],
  [0, 0, 0],
];

describe('similarityToward', () => {
  it('refuses a half turn (no unique axis) and a non-positive scale', () => {
    expect(() => similarityToward(yawSimilarity(180), 0.5, [0, 0, 0])).toThrow('no unique axis');
    expect(() => similarityToward({ ...m, s: 0 }, 0.5, [0, 0, 0])).toThrow('scale');
  });

  it('is the identity at w = 0 and the transform at w = 1', () => {
    const pivot: Vec3 = [0.5, 0, 0.7];
    for (const p of probe) {
      expect(near(applySimilarity(similarityToward(m, 0, pivot), p), p)).toBeLessThan(1e-9);
      expect(
        near(applySimilarity(similarityToward(m, 1, pivot), p), applySimilarity(m, p)),
      ).toBeLessThan(1e-9);
    }
  });

  it('halves compose to the whole when the pivot is fixed, and the pivot moves linearly', () => {
    const pivot: Vec3 = [0.5, 0, 0.7];
    const fixed: Similarity = { ...m, t: [0, 0, 0] };
    const back = applySimilarity(fixed, pivot);
    const about: Similarity = {
      ...fixed,
      t: [pivot[0] - back[0], pivot[1] - back[1], pivot[2] - back[2]],
    };
    const half = similarityToward(about, 0.5, pivot);
    for (const p of probe)
      expect(
        near(applySimilarity(composeSimilarity(half, half), p), applySimilarity(about, p)),
      ).toBeLessThan(1e-9);
    const end = applySimilarity(m, pivot);
    const mid = applySimilarity(similarityToward(m, 0.25, pivot), pivot);
    expect(
      near(mid, [
        pivot[0] + (end[0] - pivot[0]) / 4,
        pivot[1] + (end[1] - pivot[1]) / 4,
        pivot[2] + (end[2] - pivot[2]) / 4,
      ]),
    ).toBeLessThan(1e-9);
  });
});
