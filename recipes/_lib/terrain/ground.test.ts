// Terrain colour helpers. Failure first: a one-cell colour line must come out softened.

import { describe, expect, it } from 'bun:test';
import { type Mesh, NATURE_LIBRARY, stripRect, type Vec3 } from '@developerz.ai/ts23d';
import { footprint, macroUV, ribbon } from './ground.ts';

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

describe('macroUV cut sides', () => {
  it('maps the wall at the same texel scale along and up (no tall thin texels: vertical streaks)', () => {
    // One wall quad on the south cut, 2000 m long and 1200 m tall, normal −Y.
    const wall: Mesh = {
      positions: new Float32Array([
        -1000, -1000, 0, 1000, -1000, 0, 1000, -1000, 1200, -1000, -1000, 1200,
      ]),
      normals: new Float32Array([0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0]),
      uvs: new Float32Array(8),
      colors: new Float32Array(12),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    };
    const m = macroUV(wall, [-1000, -1000, 1000, 1000], 1200);
    const r = stripRect('rock_strata');
    // Rock metres per wall metre, both ways: U's strip spans `r.metres` of rock, one strip row
    // (V) spans the material's `scaleMetres`. Equal means square texels on the wall. The pre-fix
    // mapping (`along * 0.15` strips) gives 0.15 × 32 = 4.8 here and fails.
    const band = NATURE_LIBRARY.rock_strata?.scaleMetres ?? Number.NaN;
    const along = ((((m.uvs[2] ?? 0) - (m.uvs[0] ?? 0)) / (r.u1 - r.u0)) * r.metres) / 2000;
    const up = ((((m.uvs[5] ?? 0) - (m.uvs[1] ?? 0)) / (r.v1 - r.v0)) * band) / 1200;
    expect(along / up).toBeGreaterThan(0.8);
    expect(along / up).toBeLessThan(1.25);
  });
});

describe('macroUV surface', () => {
  it('maps the ground at the same material scale along X and Y (no streaks along +Y)', () => {
    // A flat 100 m square of ground near the tile's south-west corner, normal +Z.
    const flat: Mesh = {
      positions: new Float32Array([-1000, -1000, 5, -900, -1000, 5, -900, -900, 5, -1000, -900, 5]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
      uvs: new Float32Array(8),
      colors: new Float32Array(12),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    };
    const m = macroUV(flat, [-1000, -1000, 1000, 1000], 1200);
    const r = stripRect('concrete');
    // Strip metres per ground metre along X (U) and Y (V, one row = 1 m of concrete). The pre-fix
    // mapping (one row over the whole tile, U × 3) gives ~12 here and fails.
    const alongX = (((m.uvs[2] ?? 0) - (m.uvs[0] ?? 0)) / (r.u1 - r.u0)) * r.metres;
    const alongY = ((m.uvs[7] ?? 0) - (m.uvs[1] ?? 0)) / (r.v1 - r.v0);
    expect(alongX / alongY).toBeGreaterThan(0.8);
    expect(alongX / alongY).toBeLessThan(1.25);
  });
});
