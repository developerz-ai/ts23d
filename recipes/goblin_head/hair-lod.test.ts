// The goblin's wisps at the far LODs (D589), measured on the compiled LOD1 and LOD2: the few
// wisps and tufts curl on the dome instead of standing off it as quills (LOD0's, lifted 0.75 rad
// on purpose: p99 29 mm, the farthest 34 mm off the skin), and the far head keeps some hair.

import { describe, expect, it } from 'bun:test';
import { compile } from '@developerz.ai/ts23d';
import { cardStandoff, quantile } from '../_lib/bust/hair.ts';
import { goblin_head } from './goblin_head.ts';

const mm = (m: number): number => Math.round(m * 10000) / 10;

describe('goblin wisps at LOD1 and LOD2 (D589)', () => {
  // Before: the farthest 66 mm at both LODs — twice as wide, half the segments, LOD0's lift.
  for (const lod of [1, 2] as const)
    it(`curl on the dome at LOD${lod}`, () => {
      const a = compile(goblin_head, { lod });
      const d = cardStandoff(a);
      expect(d.length).toBeGreaterThan(40);
      expect(mm(quantile(d, 1))).toBeLessThan(25);
    });
});
