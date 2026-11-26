// harmonicPowers: the same numbers as the direct transform, at any length, and fast when long.

import { describe, expect, it, mock } from 'bun:test';
import * as dmath from '../core/dmath.ts';
import type { dmath as Dmath } from '../core/index.ts';

// Count dmath's trig calls with a module mock. The real functions come from dmath.ts directly, so
// the numbers stay unchanged; the wrapper is mutable on purpose because Bun re-evaluates the mock
// factory on each import, and the count lives in a holder the wrappers read every time.
const { cos, sin } = dmath;
const counter = { calls: 0 };
const counted: typeof Dmath = {
  ...dmath,
  cos: (x: number): number => {
    counter.calls++;
    return cos(x);
  },
  sin: (x: number): number => {
    counter.calls++;
    return sin(x);
  },
};
mock.module('../core/index.ts', () => ({ dmath: counted }));
const { harmonicPowers } = await import('./chain-fft.ts');

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

  it('computes dmath trig once per FFT stage, not once per butterfly', () => {
    // n=32 -> padded size 64, six stages of 1..32 twiddles per FFT. Two shared tables (one per
    // sign) cost 2 × 2 × 63 = 252 trig calls; the chirp costs 2 × 32 = 64. Rebuilding the tables
    // per FFT costs 378, and the old per-butterfly loop made 1216 calls for this input.
    const y = Array.from({ length: 32 }, (_, k) => k % 7);
    counter.calls = 0;
    harmonicPowers(y);
    expect(counter.calls).toBe(64 + 2 * 2 * (1 + 2 + 4 + 8 + 16 + 32));
  });

  it('handles a clip of two hundred thousand samples quickly', () => {
    const y = wobble(200_000);
    counter.calls = 0;
    const start = performance.now();
    const p = harmonicPowers(y);
    const elapsed = performance.now() - start;
    // Check the work and the answer, not just the clock: a fast but wrong implementation fails.
    // Two chirp angles per sample plus one cosine and one sine for each k of every stage, in
    // both signs: 2n + 2 × 2 × Σ(half) over stages = 2n + 4 × (size - 1).
    let size = 1;
    while (size < 2 * y.length - 1) size *= 2;
    expect(counter.calls).toBe(2 * y.length + 4 * (size - 1));
    expect(p).toHaveLength(100_001);
    expect(p.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
    // wobble's tone is harmonic 7; the chirp noise must not overtake it.
    let peak = 0;
    for (let m = 1; m < p.length; m++) if ((p[m] ?? 0) > (p[peak] ?? 0)) peak = m;
    expect(peak).toBe(7);
    // Generous budget: a slow, shared CPU can take several times longer than an idle one.
    expect(elapsed).toBeLessThan(15_000);
  });
});
