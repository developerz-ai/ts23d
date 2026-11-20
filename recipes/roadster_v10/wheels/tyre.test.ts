// Both tyre sizes carry all four circumferential groove floors at LOD0. Failure first: columns
// placed for the front tyre's half-width missed every groove of the wider rear tyre.

import { describe, expect, it } from 'bun:test';
import { dmath } from '@developerz.ai/ts23d';
import { TYRE_F, TYRE_R } from '../dims.ts';
import { tyre, tyreRadius } from './tyre.ts';

describe('tyre LOD0 tread', () => {
  for (const [name, t] of [
    ['front', TYRE_F],
    ['rear', TYRE_R],
  ] as const)
    it(`${name}: a groove floor (7 mm deep) under each of the four grooves`, () => {
      const m = tyre(0, t);
      const R = tyreRadius(t);
      const hw = t.width / 2;
      for (const g of [-0.62, -0.24, 0.24, 0.62]) {
        let floor = 0;
        for (let i = 0; i < m.positions.length; i += 3) {
          const [x, y, z] = [m.positions[i] ?? 0, m.positions[i + 1] ?? 0, m.positions[i + 2] ?? 0];
          if (Math.abs(y - g * hw) < 0.0055 && Math.abs(dmath.hypot(x, z) - (R - 0.007)) < 1e-4)
            floor++;
        }
        expect({ g, floor: floor > 0 }).toEqual({ g, floor: true });
      }
    });
});
