import { describe, expect, it } from 'bun:test';
import { createRng, dmath, Ts23dError } from '../core/index.ts';
import { type ErosionOptions, hydraulicErosion } from './erosion.ts';
import { terrainGrid } from './terrain-grid.ts';

const grid = terrainGrid({
  rect: [0, 0, 100, 100],
  cells: 24,
  height: (x, y) => dmath.sin(x / 10) * 10 + y * 0.3,
});
const erode = (o: ErosionOptions) => hydraulicErosion(grid, createRng(1), { droplets: 400, ...o });

describe('hydraulicErosion options', () => {
  it('refuses a NaN or out-of-range rate instead of returning an all-NaN terrain', () => {
    const bad: ErosionOptions[] = [
      { inertia: Number.NaN },
      { inertia: 5 },
      { erode: Number.NaN },
      { erode: -0.1 },
      { deposit: 1.5 },
      { evaporate: 2 },
      { capacity: -4 },
      { capacity: Number.POSITIVE_INFINITY },
      { minCapacity: Number.NaN },
      { gravity: -1 },
    ];
    for (const o of bad) {
      let caught: unknown;
      try {
        erode(o);
      } catch (e) {
        caught = e;
      }
      expect(caught, JSON.stringify(o)).toBeInstanceOf(Ts23dError);
      expect((caught as Ts23dError).code).toBe('T3D_RECIPE_INVALID');
      expect((caught as Ts23dError).fix.length).toBeGreaterThan(10);
    }
  });

  it('accepts the ends of every range and stays finite', () => {
    for (const o of [
      { inertia: 0, erode: 0, deposit: 0, evaporate: 0 },
      { inertia: 1, erode: 1, deposit: 1, evaporate: 1 },
      { capacity: 0, minCapacity: 0, gravity: 0 },
    ])
      expect(erode(o).z.every(Number.isFinite)).toBe(true);
  });
});
