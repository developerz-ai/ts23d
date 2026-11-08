// T-34 stands on its tracks at every LOD: nothing below z = 0 (links rounding the end wheels used
// to dip 1.4 cm under the ground at LOD1) and the lowest point on the ground (±2 mm).
import { describe, expect, it } from 'bun:test';
import { box, defineAsset, hex } from '@developerz.ai/ts23d';
import { assertUprightOnGround } from '@developerz.ai/ts23d/testing';
import { t34, t34_1941 } from './t34.ts';

describe('t34 on the ground', () => {
  it('the check fails a track 1.4 cm under the ground', () => {
    const sunk = defineAsset({
      name: 'sunk_track',
      kind: 'prop',
      budget: { triangles: [100, 100, 100] },
      build(ctx) {
        ctx.part(
          'track_l',
          box({ size: [5, 0.55, 0.06], at: [0, 0, -0.014], color: hex('#4a4139') }),
        );
      },
    });
    expect(() => assertUprightOnGround(sunk, { eps: 0.002 })).toThrow(/below the ground/);
  });

  for (const asset of [t34, t34_1941])
    it(`${asset.name} rests on z = 0 at every LOD`, () => {
      expect(Math.abs(assertUprightOnGround(asset, { eps: 0.002 }))).toBeLessThanOrEqual(0.002);
    });
});
