import { describe, expect, it } from 'bun:test';
import type { Mesh } from '../core/index.ts';
import { surfaceSamples } from './geometry.ts';

/** One 3 × 2 m right triangle in the YZ plane at x = 0. */
const tri: Mesh = {
  positions: new Float32Array([0, 0, 0, 0, 3, 0, 0, 0, 2]),
  normals: new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0]),
  uvs: new Float32Array(6),
  colors: new Float32Array(9),
  indices: new Uint32Array([0, 1, 2]),
};

const inBand = (pts: ReadonlyArray<readonly number[]>): number =>
  pts.filter((p) => Math.abs((p[1] ?? 0) - 0.5) < 0.05 && Math.abs((p[2] ?? 0) - 0.5) < 0.05)
    .length;

describe('surfaceSamples', () => {
  it('leaves face interiors empty without an interior cap', () => {
    expect(inBand(surfaceSamples(tri, 0.1, 4))).toBe(0);
  });

  it('samples face interiors at `step`, capped per triangle', () => {
    const plain = surfaceSamples(tri, 0.1, 4).length;
    const dense = surfaceSamples(tri, 0.1, 4, 400);
    expect(inBand(dense)).toBeGreaterThan(0);
    expect(dense.length - plain).toBeLessThanOrEqual(400);
    expect(dense.length - plain).toBeGreaterThan(300);
    for (const p of dense) expect((p[1] ?? 0) / 3 + (p[2] ?? 0) / 2).toBeLessThanOrEqual(1 + 1e-6);
  });

  it('adds nothing inside triangles smaller than `step`', () => {
    expect(surfaceSamples(tri, 5, 4, 400).length).toBe(surfaceSamples(tri, 5, 4).length);
  });
});
