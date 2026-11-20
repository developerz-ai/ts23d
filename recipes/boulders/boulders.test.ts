// The soil skirt fades out to the pale edge tone all the way round. Failure first: the skirt
// fraction was scaled by the rock's smaller axis, so on a 2.4 × 1.7 m rock its +X edge came out at
// 1.7 / 2.4 = 0.71 and never reached the edge tone: a dark rim on the long sides.
import { describe, expect, it } from 'bun:test';
import { dmath } from '@developerz.ai/ts23d';
import { skirtFraction } from './boulders.ts';

const reach = (a: number): number =>
  0.3 * (1 + 0.18 * dmath.sin(2 * a + 1) + 0.1 * dmath.sin(3 * a));

describe('boulders soil skirt', () => {
  const [l, w] = [2.4, 1.7];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    it(`bearing ${k}/16: 0 on the rock outline, 1 on the skirt edge, ½ half way`, () => {
      const at = (t: number): [number, number] => [
        dmath.cos(a) * (l / 2 + t * reach(a)),
        dmath.sin(a) * (w / 2 + t * reach(a)),
      ];
      for (const t of [0, 0.5, 1]) expect(skirtFraction(...at(t), l, w, reach)).toBeCloseTo(t, 6);
    });
  }
  it('is negative inside the rock', () => {
    expect(skirtFraction(0.2, 0.1, l, w, reach)).toBeLessThan(0);
  });
});
