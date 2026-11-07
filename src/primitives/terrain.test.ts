import { describe, expect, it } from 'bun:test';
import { boundsOf, createRng, Ts23dError, triangleCount, type Vec3 } from '../core/index.ts';
import { windingFlips } from './closed.ts';
import { hydraulicErosion } from './erosion.ts';
import { heightfield } from './heightfield.ts';
import { terrainColor } from './terrain-color.ts';
import {
  sampler,
  slopeMap,
  type TerrainGrid,
  terrainGrid,
  thermalErosion,
} from './terrain-grid.ts';

const RECT = [0, 0, 640, 640] as const;
/** A cone-shaped hill: 300 m high, slopes ~0.94 (43°). */
const hill = (): TerrainGrid =>
  terrainGrid({
    rect: RECT,
    cells: 64,
    height: (x, y) => Math.max(0, 300 - Math.hypot(x - 320, y - 320) * 0.94),
  });
const maxSlope = (g: TerrainGrid): number => Math.max(...slopeMap(g));

const fails = (f: () => unknown): Ts23dError => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('expected a Ts23dError');
};

describe('terrain grid', () => {
  it('throws T3D_RECIPE_INVALID with a fix on bad input', () => {
    const e = fails(() => terrainGrid({ rect: [0, 0, 0, 10], cells: 8, height: () => 0 }));
    expect(e.code).toBe('T3D_RECIPE_INVALID');
    expect(e.fix).toContain('max > min');
    expect(fails(() => terrainGrid({ rect: RECT, cells: 1, height: () => 0 })).fix).toContain(
      'whole number',
    );
    expect(
      fails(() => terrainGrid({ rect: RECT, cells: 8, height: () => Number.NaN })).fix,
    ).toContain('finite');
    expect(fails(() => hydraulicErosion(hill(), createRng(1), { droplets: -1 })).fix).toContain(
      'whole number',
    );
  });

  it('samples exactly at grid points and bilinearly between', () => {
    const g = terrainGrid({ rect: RECT, cells: 4, height: (x, y) => x * 0.5 + y });
    const at = sampler(g);
    expect(at(160, 320)).toBeCloseTo(400, 9);
    expect(at(80, 80)).toBeCloseTo(120, 9);
    expect(at(-50, 700)).toBeCloseTo(640, 9); // clamped to the corner (0, 640)
  });

  it('thermal erosion relaxes slopes toward the talus and conserves material', () => {
    const g = hill();
    const sum = (z: Float64Array): number => z.reduce((s, v) => s + v, 0);
    const t = thermalErosion(g, { talus: 0.5, iterations: 200 });
    expect(maxSlope(t)).toBeLessThan(maxSlope(g));
    expect(maxSlope(t)).toBeLessThan(0.75); // central differences over 2 cells read a little steeper
    expect(sum(t.z)).toBeCloseTo(sum(g.z), 3);
    expect(thermalErosion(g, { iterations: 0 }).z).toEqual(g.z);
  });

  it('hydraulic erosion carves, records flow + deposit, and is seeded', () => {
    const g = hill();
    const e = hydraulicErosion(g, createRng(9), { droplets: 4000 });
    let changed = 0;
    for (let i = 0; i < g.z.length; i++)
      if (Math.abs((e.z[i] ?? 0) - (g.z[i] ?? 0)) > 0.01) changed++;
    expect(changed).toBeGreaterThan(g.z.length / 10);
    expect(Math.max(...(e.flow ?? []))).toBeCloseTo(1, 9);
    expect(Math.max(...(e.deposit ?? []))).toBeCloseTo(1, 9);
    // Deposits collect low: mean deposit below 100 m beats the mean above 200 m.
    const mean = (pick: (z: number) => boolean): number => {
      const v = [...(e.deposit ?? [])].filter((_, i) => pick(g.z[i] ?? 0));
      return v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
    };
    expect(mean((z) => z > 0 && z < 100)).toBeGreaterThan(mean((z) => z > 200));
    expect(hydraulicErosion(g, createRng(9), { droplets: 4000 })).toEqual(e);
    expect(hydraulicErosion(g, createRng(10), { droplets: 4000 }).z).not.toEqual(e.z);
  });
});

describe('terrain colour + heightfield skirt', () => {
  const P = {
    forest: [0, 0.3, 0] as Vec3,
    grass: [0.4, 0.6, 0.2] as Vec3,
    scree: [0.5, 0.5, 0.4] as Vec3,
    rock: [0.4, 0.4, 0.4] as Vec3,
    snow: [1, 1, 1] as Vec3,
    wet: [0.2, 0.2, 0.1] as Vec3,
  };

  it('bands by altitude and slope: forest low, rock steep, snow high and gentle', () => {
    const flat = terrainGrid({ rect: RECT, cells: 8, height: () => 0 });
    const color = terrainColor(flat, { palette: P, datum: 1000, treeline: 2000, snowline: 3000 });
    expect(color(320, 320, 0)).toEqual([0, 0.3, 0]);
    // z 1100 = 2100 m: just above the treeline, meadow.
    expect(color(320, 320, 1100)[1]).toBeCloseTo(0.6, 1);
    expect(color(320, 320, 1100)[0]).toBeCloseTo(0.4, 1);
    expect(color(320, 320, 2500)).toEqual([1, 1, 1]);
    const steep = terrainGrid({ rect: RECT, cells: 8, height: (x) => x * 2 });
    const rock = terrainColor(steep, { palette: P, treeline: 2000, snowline: 3000 });
    expect(rock(320, 320, 3500)).toEqual([0.4, 0.4, 0.4]);
  });

  it('skirt closes the sides to the base: +4·(cx + cy) triangles, outward, grounded', () => {
    const g = hill();
    const o = {
      rect: RECT,
      cells: [32, 32] as const,
      height: sampler(g),
      color: [1, 1, 1] as Vec3,
    };
    const open = heightfield(o);
    const solid = heightfield({ ...o, skirt: -10 });
    expect(triangleCount(open)).toBe(2 * 32 * 32);
    expect(triangleCount(solid)).toBe(2 * 32 * 32 + 4 * 64);
    expect(boundsOf(solid).min[2]).toBeCloseTo(-10, 6);
    expect(windingFlips(solid)).toBe(0);
    // The wall normals point away from the tile centre.
    const n = solid.normals;
    const p = solid.positions;
    for (let i = open.positions.length; i < p.length; i += 3)
      expect(
        ((p[i] ?? 0) - 320) * (n[i] ?? 0) + ((p[i + 1] ?? 0) - 320) * (n[i + 1] ?? 0),
      ).toBeGreaterThan(0);
  });
});
