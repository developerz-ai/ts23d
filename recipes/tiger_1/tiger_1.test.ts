// Tiger I stands on its tracks at every LOD: nothing below z = 0 (the open LOD2 belt and
// link-by-link LOD0 belt) and the lowest point on the ground (±2 mm).
import { describe, expect, it } from 'bun:test';
import { box, defineAsset, hex } from '@developerz.ai/ts23d';
import { assertUprightOnGround } from '@developerz.ai/ts23d/testing';
import { tiger_1 } from './tiger_1.ts';

describe('tiger_1 on the ground', () => {
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

  for (const asset of [tiger_1])
    it(`${asset.name} rests on z = 0 at every LOD`, () => {
      expect(Math.abs(assertUprightOnGround(asset, { eps: 0.002 }))).toBeLessThanOrEqual(0.002);
    });
});
