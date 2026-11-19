// Terrain colour helpers. Failure first: a one-cell colour line must come out softened.

import { describe, expect, it } from 'bun:test';
import type { Vec3 } from '@developerz.ai/ts23d';
import { footprint, ribbon } from './ground.ts';

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

describe('ribbon', () => {
  const path: [number, number][] = [
    [0, 0],
    [10, 0],
    [20, 0],
  ];
  it('lifts the water surface over flat ground instead of burying it under the banks', () => {
    const m = ribbon(path, [6, 6], () => 0, 0.5, [0, 0, 1]);
    const zs: number[] = [];
    for (let i = 2; i < m.positions.length; i += 3) zs.push(m.positions[i] ?? 0);
    expect(Math.max(...zs)).toBeCloseTo(0.5, 6);
    // The banks still sink into the ground so the surface meets both shores.
    expect(Math.min(...zs)).toBeCloseTo(-0.3, 6);
  });
  it('faces every triangle up', () => {
    const m = ribbon(path, [6, 6], () => 0, 0.5, [0, 0, 1]);
    const p = (i: number): Vec3 => [m.positions[i * 3] ?? 0, m.positions[i * 3 + 1] ?? 0, 0];
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, b, c] = [p(m.indices[t] ?? 0), p(m.indices[t + 1] ?? 0), p(m.indices[t + 2] ?? 0)];
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      expect(cross).toBeGreaterThan(0);
    }
  });
});
