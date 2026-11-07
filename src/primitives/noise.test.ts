import { describe, expect, it } from 'bun:test';
import { createRng } from '../core/index.ts';
import {
  billow,
  fbm,
  gradientNoise2,
  type Noise2,
  ridged,
  terrace,
  valueNoise2,
  warp,
} from './noise.ts';

const grid = (n: Noise2, step = 0.37, count = 40): number[] => {
  const out: number[] = [];
  for (let j = 0; j < count; j++)
    for (let i = 0; i < count; i++) out.push(n(i * step - 3.1, j * step + 1.7));
  return out;
};
const range = (v: number[]): [number, number] => [Math.min(...v), Math.max(...v)];

describe('noise', () => {
  it('is seeded: same seed same values, different seed different values', () => {
    for (const make of [gradientNoise2, valueNoise2]) {
      expect(grid(make(createRng(5)))).toEqual(grid(make(createRng(5))));
      expect(grid(make(createRng(5)))).not.toEqual(grid(make(createRng(6))));
    }
  });

  it('gradient noise is zero on its lattice and bounded', () => {
    const n = gradientNoise2(createRng(1));
    for (let i = -3; i < 4; i++) expect(n(i, 2 - i)).toBe(0);
    const [lo, hi] = range(grid(n));
    expect(lo).toBeGreaterThanOrEqual(-1);
    expect(hi).toBeLessThanOrEqual(1);
    expect(hi - lo).toBeGreaterThan(0.8);
  });

  it('fractals stay in range; ridged is [0, 1] with detail piled on its ridges', () => {
    const base = gradientNoise2(createRng(2));
    for (const f of [fbm(base, { scale: 3 }), billow(base, { scale: 3 })]) {
      const [lo, hi] = range(grid(f));
      expect(lo).toBeGreaterThanOrEqual(-1);
      expect(hi).toBeLessThanOrEqual(1);
    }
    const r = grid(ridged(base, { scale: 3 }));
    expect(Math.min(...r)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...r)).toBeLessThanOrEqual(1);
    // `scale` is metres per feature: a larger scale varies less between neighbours.
    const rough = (n: Noise2): number =>
      grid(n, 0.1).reduce((s, v, i, a) => s + Math.abs(v - (a[i - 1] ?? v)), 0);
    expect(rough(fbm(base, { scale: 10 }))).toBeLessThan(rough(fbm(base, { scale: 1 })));
  });

  it('warp moves samples; amount 0 is the identity', () => {
    const base = fbm(gradientNoise2(createRng(3)), { scale: 2 });
    const w = fbm(gradientNoise2(createRng(4)), { scale: 2 });
    expect(grid(warp(base, w, w, 0))).toEqual(grid(base));
    expect(grid(warp(base, w, w, 1))).not.toEqual(grid(base));
  });

  it('terrace snaps toward steps by sharpness', () => {
    expect(terrace(13, 10, 0)).toBeCloseTo(13, 9);
    expect(terrace(13, 10, 1)).toBeCloseTo(10, 9);
    expect(terrace(18, 10, 1)).toBeCloseTo(10, 9);
    expect(terrace(19.99, 10, 0.8)).toBeCloseTo(20, 1);
    // Monotonic: terraces never fold the ground back on itself.
    for (let h = 0; h < 40; h += 0.25)
      expect(terrace(h + 0.25, 10, 0.7)).toBeGreaterThanOrEqual(terrace(h, 10, 0.7));
    expect(terrace(-3, 10, 1)).toBeCloseTo(-10, 9); // treads sit at their step floor
  });
});
