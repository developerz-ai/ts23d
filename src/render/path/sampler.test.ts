// The sampler: values in [0, 1), the same numbers every run, a stratified first 2^k points in each
// pair of dimensions (Owen scrambling keeps Sobol's (0, 2) net), different pixels decorrelated.

import { describe, expect, it } from 'bun:test';
import { owen, pixelSeed, sample4, sobol } from './sampler.ts';

const pts = (seed: number, group: number, n: number): number[][] => {
  const out: number[][] = [];
  const u = new Float64Array(4);
  for (let i = 0; i < n; i++) {
    sample4(seed, group, i, u);
    out.push([...u]);
  }
  return out;
};

describe('sampler', () => {
  it('a plain lattice is not stratified the way the check expects (the check can fail)', () => {
    const grid = Array.from({ length: 16 }, (_, i) => [i / 16 + 0.01, i / 16 + 0.01]);
    expect(stratified(grid, 0, 1, 4)).toBe(false);
  });

  it('keeps one point per 4 × 4 cell in the first 16 samples, in the pairs used together', () => {
    for (const seed of [0, 1, pixelSeed(17, 3, 960)]) {
      const p = pts(seed, 2, 16);
      for (const [a, b] of [
        [0, 1],
        [1, 2],
        [2, 3],
      ] as const)
        expect(stratified(p, a, b, 4)).toBe(true);
      for (const row of p) for (const x of row) expect(x >= 0 && x < 1).toBe(true);
    }
  });

  it('is deterministic and decorrelated across pixels and groups', () => {
    expect(pts(7, 1, 8)).toEqual(pts(7, 1, 8));
    expect(pts(7, 1, 8)).not.toEqual(pts(8, 1, 8));
    expect(pts(7, 1, 8)).not.toEqual(pts(7, 2, 8));
    expect(pixelSeed(1, 0, 4)).not.toBe(pixelSeed(0, 1, 4));
  });

  it('builds the Sobol radical inverse in dimension 0 and scrambles bijectively', () => {
    expect(sobol(1, 0)).toBe(0x80000000);
    expect(sobol(2, 0)).toBe(0x40000000);
    expect(sobol(3, 0)).toBe(0xc0000000);
    const seen = new Set<number>();
    for (let i = 0; i < 256; i++) seen.add(owen(i << 24, 99) >>> 24);
    expect(seen.size).toBe(256);
  });
});

/** True when every cell of an n × n grid over dims (a, b) holds exactly one point. */
function stratified(p: readonly number[][], a: number, b: number, n: number): boolean {
  const cells = new Set<number>();
  for (const q of p) cells.add(Math.floor((q[a] ?? 0) * n) * n + Math.floor((q[b] ?? 0) * n));
  return cells.size === n * n && p.length === n * n;
}
