// The tile's height field. Failure first: the border row must be as smooth as the rows inside it
// (eroding the tile alone left it unrelaxed: a saw-tooth along the skirt's top), and the field
// must be one function of world position, so a neighbour tile meets this one along the cut.

import { describe, expect, it } from 'bun:test';
import { createRng, dmath, type TerrainGrid, terrainGrid } from '@developerz.ai/ts23d';
import { crop, fieldHeight, RECT, tileField } from './field.ts';
import { mountainRange, VARIANTS } from './mountain_range.ts';

const params = { ...mountainRange.defaults, ...VARIANTS.mountain_range.params };

/** RMS second difference (m) along row `r` from the cut, over all four sides. */
function roughness(g: TerrainGrid, r: number): number {
  const z = (i: number, j: number): number => g.z[j * g.nx + i] ?? 0;
  const far = g.nx - 1 - r;
  let s = 0;
  let n = 0;
  for (let i = r + 1; i < far; i++)
    for (const [a, b, c] of [
      [z(i - 1, r), z(i, r), z(i + 1, r)],
      [z(i - 1, far), z(i, far), z(i + 1, far)],
      [z(r, i - 1), z(r, i), z(r, i + 1)],
      [z(far, i - 1), z(far, i), z(far, i + 1)],
    ] as const) {
      s += dmath.pow(a - 2 * b + c, 2);
      n++;
    }
  return Math.sqrt(s / n);
}

describe('tileField', () => {
  const g = tileField(createRng(VARIANTS.mountain_range.seed), params);
  it('covers the tile at ~7.8 m with flow and deposit maps', () => {
    expect([g.nx, g.ny]).toEqual([257, 257]);
    expect(g.rect).toEqual(RECT);
    expect(g.flow?.length).toBe(257 * 257);
    expect(g.deposit?.length).toBe(257 * 257);
  });
  it('keeps the border row as smooth as the ground inside it (no saw-tooth on the cut)', () => {
    expect(roughness(g, 0)).toBeLessThan(1.3 * roughness(g, 16));
  });
});

describe('fieldHeight', () => {
  it('is one function of world position: neighbour tiles agree along the shared cut', () => {
    const rng = (): ReturnType<typeof createRng> => createRng(7);
    const here = fieldHeight(rng(), { ...params, offset: [100, -300] });
    const east = fieldHeight(rng(), { ...params, offset: [2100, -300] });
    const north = fieldHeight(rng(), { ...params, offset: [100, 1700] });
    for (let t = -1000; t <= 1000; t += 125) {
      expect(east(-1000, t)).toBe(here(1000, t));
      expect(north(t, -1000)).toBe(here(t, 1000));
    }
  });
  it('moves the window, not the ground: a shifted offset shows other heights', () => {
    const a = fieldHeight(createRng(7), { ...params, offset: [0, 0] });
    const b = fieldHeight(createRng(7), { ...params, offset: [300, 0] });
    expect(b(0, 0)).not.toBe(a(0, 0));
    expect(b(0, 0)).toBe(a(300, 0));
  });
});

describe('crop', () => {
  it('cuts the margin off every side, maps included', () => {
    const wide = {
      ...terrainGrid({ rect: [-3, -3, 3, 3], cells: 6, height: (x, y) => x * 10 + y }),
      flow: new Float64Array(49).map((_, k) => k),
    };
    const g = crop(wide, 2);
    expect([g.nx, g.ny]).toEqual([3, 3]);
    expect(g.rect).toEqual([-1, -1, 1, 1]);
    expect(Array.from(g.z)).toEqual([-11, -1, 9, -10, 0, 10, -9, 1, 11]);
    expect(Array.from(g.flow ?? [])).toEqual([16, 17, 18, 23, 24, 25, 30, 31, 32]);
    expect(g.deposit).toBeUndefined();
  });
});
