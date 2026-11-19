// model-doubled: the leg-outline rule cuts at a tenth of the height above z = 0, so it holds only
// for a body standing on the ground; a swimmer (`medium: 'water'`) has no ground to cut above.

import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, type Vec3 } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { doubledFeatures } from './model-doubled.ts';

const FEET: readonly Vec3[] = [
  [0.4, 0.07, 0],
  [0.4, -0.07, 0],
  [-0.4, 0.07, 0],
  [-0.4, -0.07, 0],
];

/** A four-legged table body `lift` metres up (negative: below z = 0), with its skeleton. */
function table(lift: number) {
  const a = compile(
    defineAsset({
      name: 'table',
      kind: 'creature',
      budget: { triangles: [500, 500, 500] },
      build(ctx) {
        ctx.bone('spine', { head: [-0.45, 0, 0.45 + lift], tail: [0.45, 0, 0.45 + lift] });
        FEET.forEach((f, i) => {
          ctx.bone(`leg_${i}`, {
            parent: 'spine',
            head: [f[0], f[1], 0.4 + lift],
            tail: [f[0], f[1], 0.01 + lift],
          });
        });
        ctx.part('top', box({ size: [1, 0.18, 0.08], at: [0, 0, 0.41 + lift], color: [1, 1, 1] }));
        FEET.forEach((f, i) => {
          ctx.part(
            `leg_${i}`,
            box({ size: [0.05, 0.05, 0.43], at: [f[0], f[1], lift], color: [1, 1, 1] }),
          );
        });
      },
    }),
  );
  return { sk: a.skeleton, meshes: a.parts.flatMap((p) => (p.mesh ? [p.mesh] : [])) };
}

describe('doubledFeatures legs', () => {
  it('misreads a body 3 m below z = 0 when told nothing, and skips the leg cut in water', () => {
    const { sk, meshes } = table(-3);
    const legsOf = (medium?: 'water' | 'ground') =>
      meshes
        .flatMap((m) => (sk ? doubledFeatures(m, [0, 0, 0], sk, medium) : []))
        .filter((d) => d.what.startsWith('legs'));
    expect(legsOf('ground').length).toBeGreaterThan(0);
    expect(legsOf('water')).toEqual([]);
  });
});
