// Terrain colour helpers. Failure first: a one-cell colour line must come out softened.

import { describe, expect, it } from 'bun:test';
import type { Vec3 } from '@developerz.ai/ts23d';
import { footprint } from './ground.ts';

describe('footprint', () => {
  it('spreads a one-cell bright line over its neighbours instead of keeping it whole', () => {
    // White on a 2 m strip round x = 0, black elsewhere.
    const line = (x: number, _y: number, _z: number): Vec3 =>
      Math.abs(x) < 1 ? [1, 1, 1] : [0, 0, 0];
    const soft = footprint(line, () => 0, 6, 5);
    expect(line(0, 0, 0)[0]).toBe(1);
    expect(soft(0, 0, 0)[0]).toBeLessThan(0.5);
    expect(line(3, 0, 0)[0]).toBe(0);
    expect(soft(3, 0, 0)[0]).toBeGreaterThan(0);
  });
  it('keeps the colour when the radius is 0', () => {
    const c = (): Vec3 => [0.3, 0.2, 0.1];
    expect(footprint(c, () => 0, 0, 5)).toBe(c);
  });
});
