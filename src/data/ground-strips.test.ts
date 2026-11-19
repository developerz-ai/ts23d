// Ground strips on a terrain tile. Failure cases first, as the per-triangle version rendered them
// (D307): the mesh came back unwelded (three vertices a triangle, each with its own UV band and
// strip), so material switched at every triangle border and each triangle's texture was squeezed
// on its own: diagonal stripes over every slope.
import { describe, expect, test } from 'bun:test';
import type { Mesh, Vec3 } from '../core/index.ts';
import { stripAtV, stripRect } from '../material/index.ts';
import { heightfield } from '../primitives/index.ts';
import { groundStrips } from './ground-strips.ts';

const SCREE: Vec3 = [0.9, 0.1, 0.1];
const GREEN: Vec3 = [0.2, 0.5, 0.2];
/** A 400 m tile: flat in the west, a 31° ramp in the middle, a 50° face in the east. */
const tile = (cells: number): Mesh =>
  heightfield({
    rect: [0, 0, 400, 400],
    cells: [cells, cells],
    height: (x) => 50 + (x < 150 ? 0 : x < 250 ? (x - 150) * 0.6 : 60 + (x - 250) * 1.2),
    color: GREEN,
    skirt: 0,
    skirtColor: [0.4, 0.35, 0.3],
  });
const ground = (m: Mesh): Mesh =>
  groundStrips(m, { scree: { color: SCREE, slope: 0.55, rockSlope: 0.85 } });
const isSide = (m: Mesh, i: number): boolean => Math.abs(m.normals[i * 3 + 2] ?? 1) < 0.05;

describe('groundStrips', () => {
  test('the mesh stays welded: no vertex is split per triangle', () => {
    const m = tile(8);
    const g = ground(m);
    expect(g.positions.length).toBe(m.positions.length);
    expect(g.indices).toEqual(m.indices);
    expect(g.positions.length / 3).toBeLessThan(g.indices.length);
  });

  test('one strip and one UV scale over the whole surface: no per-triangle squeeze', () => {
    const g = ground(tile(8));
    const top = stripRect('concrete');
    const per: number[] = [];
    for (let t = 0; t < g.indices.length; t += 3) {
      const ids = [g.indices[t] ?? 0, g.indices[t + 1] ?? 0, g.indices[t + 2] ?? 0];
      if (ids.some((i) => isSide(g, i))) continue;
      for (const i of ids) expect(stripAtV(g.uvs[i * 2 + 1] ?? 0)).toBe('concrete');
      // V per metre of Y, from the two vertices of the triangle furthest apart in Y.
      const [a = 0, b = 0] = [...ids]
        .sort((p, q) => (g.positions[p * 3 + 1] ?? 0) - (g.positions[q * 3 + 1] ?? 0))
        .filter((_, k) => k !== 1);
      const dy = (g.positions[b * 3 + 1] ?? 0) - (g.positions[a * 3 + 1] ?? 0);
      per.push(((g.uvs[b * 2 + 1] ?? 0) - (g.uvs[a * 2 + 1] ?? 0)) / dy);
    }
    expect(per.length).toBeGreaterThan(100);
    for (const k of per) expect(k).toBeCloseTo(per[0] ?? 0, 9);
    // The whole tile fits one band of the strip (V never wraps into a neighbour).
    expect((per[0] ?? 0) * 400).toBeLessThanOrEqual(top.v1 - top.v0);
    // A finer mesh maps the same ground to the same texture: the scale is the tile's, not a cell's.
    const fine = ground(tile(16));
    const at = (m: Mesh): number => {
      for (let i = 0; i < m.positions.length / 3; i++)
        if (!isSide(m, i) && m.positions[i * 3] === 100 && m.positions[i * 3 + 1] === 200)
          return m.uvs[i * 2 + 1] ?? 0;
      throw new Error('no vertex at (100, 200)');
    };
    expect(at(fine)).toBeCloseTo(at(g), 9);
  });

  test('ground classes blend per vertex: scree fades in over the ramp, none on flats or rock', () => {
    const g = ground(tile(16));
    const red = (x: number): number => {
      for (let i = 0; i < g.positions.length / 3; i++)
        if (!isSide(g, i) && g.positions[i * 3] === x && g.positions[i * 3 + 1] === 200)
          return g.colors[i * 3] ?? 0;
      throw new Error(`no vertex at x = ${x}`);
    };
    expect(red(50)).toBeCloseTo(GREEN[0], 5);
    expect(red(200)).toBeGreaterThan(GREEN[0] + 0.2);
    expect(red(350)).toBeCloseTo(GREEN[0], 5);
    // Borders are blends, not switches: where the ramp meets the rock face the vertex sits between.
    expect(red(250)).toBeGreaterThan(red(350) + 0.05);
    expect(red(250)).toBeLessThan(red(200) - 0.05);
  });

  test('cut sides carry rock strata in one band over the wall, darker towards the base', () => {
    const g = ground(tile(8));
    const strata = stripRect('rock_strata');
    let [lo, hi, n] = [Infinity, -Infinity, 0];
    let [vLow, vHigh] = [0, 0];
    let [cLow, cHigh] = [0, 0];
    for (let i = 0; i < g.positions.length / 3; i++) {
      if (!isSide(g, i)) continue;
      n++;
      const [z, v] = [g.positions[i * 3 + 2] ?? 0, g.uvs[i * 2 + 1] ?? 0];
      expect(v).toBeGreaterThan(strata.v0);
      expect(v).toBeLessThan(strata.v1);
      if (z < lo) [lo, vLow, cLow] = [z, v, g.colors[i * 3] ?? 0];
      if (z > hi) [hi, vHigh, cHigh] = [z, v, g.colors[i * 3] ?? 0];
    }
    expect(n).toBeGreaterThan(0);
    expect(vHigh).toBeGreaterThan(vLow);
    expect(cHigh).toBeGreaterThan(cLow);
  });
});
