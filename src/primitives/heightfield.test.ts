import { expect, it } from 'bun:test';
import { boundsOf, triangleCount } from '../core/index.ts';
import { heightfield } from './heightfield.ts';

it('samples the height function on a grid with upward normals', () => {
  const m = heightfield({
    rect: [-10, -10, 10, 10],
    cells: [8, 4],
    height: (x) => x * 0.1,
    color: [1, 1, 1],
  });
  expect(triangleCount(m)).toBe(8 * 4 * 2);
  expect(boundsOf(m).max[2]).toBeCloseTo(1, 5);
  expect(m.normals[2]).toBeGreaterThan(0.9);
});
