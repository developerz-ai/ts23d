// harmonicPowers: the same numbers as the direct transform, at any length, and fast when long.

import { describe, expect, it } from 'bun:test';
import { dmath } from '../core/index.ts';
import { harmonicPowers } from './chain-fft.ts';

/** The direct transform: power of harmonic `m`, scaled to the half-swing. */
function direct(y: readonly number[], m: number): number {
  let re = 0;
  let im = 0;
  y.forEach((v, k) => {
    const a = (-2 * Math.PI * m * k) / y.length;
    re += v * dmath.cos(a);
    im += v * dmath.sin(a);
  });
  return dmath.pow((2 * re) / y.length, 2) + dmath.pow((2 * im) / y.length, 2);
}

const wobble = (n: number): number[] =>
  Array.from(
    { length: n },
    (_, k) =>
      dmath.sin((14 * Math.PI * k) / n + 0.4) +
      0.3 * dmath.cos(k * k * 0.7) +
      (0.05 * k * (n - k)) / n / n,
  );

describe('harmonicPowers', () => {
  it('matches the direct transform at even, odd, prime and power-of-two lengths', () => {
    for (const n of [8, 9, 30, 97, 128, 361, 769]) {
      const y = wobble(n);
      const p = harmonicPowers(y);
      expect(p).toHaveLength(Math.floor(n / 2) + 1);
      for (let m = 1; m <= n / 2; m++) expect(p[m] ?? -1).toBeCloseTo(direct(y, m), 9);
    }
  });

  it('finds a pure tone and nothing else', () => {
    const p = harmonicPowers(
      Array.from({ length: 90 }, (_, k) => 2 * dmath.sin((22 * Math.PI * k) / 90)),
    );
    expect(p[11] ?? 0).toBeCloseTo(4, 9);
    expect(p[10] ?? 1).toBeCloseTo(0, 9);
  });

  it('handles a clip of two hundred thousand samples quickly', () => {
    const start = performance.now();
    expect(harmonicPowers(wobble(200_000))).toHaveLength(100_001);
    expect(performance.now() - start).toBeLessThan(3000);
  });
});
