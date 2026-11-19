// The gantry's knee braces stand on a post member, and its mast-top wear reads the arms' real
// height. Failure first: LOD2's single knee foot sat between the far post's uprights, in the air,
// while a bounding-box check called it landed.

import { describe, expect, it } from 'bun:test';
import { compile, runQa } from '@developerz.ai/ts23d';
import { signal_gantry, signal_gantry_4 } from './signal_gantry.ts';

describe('signal_gantry knees', () => {
  for (const asset of [signal_gantry, signal_gantry_4])
    for (const lod of [0, 1, 2] as const)
      it(`${asset.name} LOD${lod}: every knee foot touches a post member`, () => {
        const knees = runQa(compile(asset, { lod })).filter((f) => f.part?.startsWith('knee_'));
        expect(knees.map((f) => f.message)).toEqual([]);
      });
});

describe('signal_gantry arm wear', () => {
  /** Mean vertex colour of a part. */
  const mean = (lod: 0 | 1 | 2, name: string): [number, number, number] => {
    const m = compile(signal_gantry, { lod }).parts.find((p) => p.name === name)?.mesh;
    const out: [number, number, number] = [0, 0, 0];
    const n = (m?.colors.length ?? 0) / 3;
    for (let i = 0; m && i < n; i++)
      for (let k = 0; k < 3; k++) out[k as 0 | 1 | 2] += (m.colors[i * 3 + k] ?? 0) / n;
    return out;
  };
  it('reads the blade at its height up the mast: no ground mud or splash rust on the red paint', () => {
    // LOD2's blade is all signal red (linear G ≈ 0.02). Read pivot-local (z ≈ 0), the mud line
    // (0.6 m) and the ballast-splash rust (below 2.2 m) muddied it to G ≈ 0.13.
    expect(mean(2, 'arm_0_home_blade')[1]).toBeLessThan(0.08);
  });
});
