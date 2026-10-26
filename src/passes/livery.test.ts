import { expect, it } from 'bun:test';
import { box } from '../primitives/index.ts';
import { livery } from './livery.ts';

it('applies rules in order: base, a height band, then the roof', () => {
  const m = livery(box({ size: [2, 1, 2], color: [1, 1, 1] }), {
    base: [0.2, 0.2, 0.2],
    rules: [
      { z: [0.8, 1.2], color: [1, 0, 0] },
      { facing: 'roof', color: [0, 0, 1] },
    ],
  });
  const colourAt = (pz: number, nz: number): number[] => {
    for (let i = 0; i < m.positions.length / 3; i++) {
      if (
        Math.abs((m.positions[i * 3 + 2] ?? 0) - pz) < 1e-6 &&
        Math.abs((m.normals[i * 3 + 2] ?? 0) - nz) < 1e-6
      )
        return [...m.colors.subarray(i * 3, i * 3 + 3)];
    }
    return [];
  };
  expect(colourAt(2, 1)).toEqual([0, 0, 1]);
  expect(colourAt(0, 0)).toEqual([0.2, 0.2, 0.2].map((v) => Math.fround(v)));
});
