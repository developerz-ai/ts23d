import { describe, expect, it } from 'bun:test';
import { createCanvas } from './canvas.ts';
import { curvature, fineNoise, finishRelief, isoNoise, rowNoise, worley } from './relief.ts';

const strip = () => createCanvas(256, 16, 2, 0.5, true);

/** A canvas with one pit and one bump, both a few texels across. */
function pitAndBump() {
  const c = strip();
  for (let y = 0; y < c.h; y++)
    for (let x = 0; x < c.w; x++) {
      const d1 = Math.hypot((x - 64) / 6, (y - 8) / 2);
      const d2 = Math.hypot((x - 192) / 6, (y - 8) / 2);
      c.height[y * c.w + x] = 0.001 * (Math.max(0, 1 - d2) - Math.max(0, 1 - d1));
    }
  return c;
}

describe('finishRelief', () => {
  it('is a no-op without cavity params (classic strips keep their bytes)', () => {
    const c = pitAndBump();
    finishRelief(c, undefined);
    finishRelief(c, { grime: 0.3 });
    expect(c.occl.every((v) => v === 1)).toBe(true);
    expect(c.rough.every((v) => Math.abs(v - 0.8) < 1e-6)).toBe(true);
  });

  it('darkens and roughens the pit, smooths the bump', () => {
    const c = pitAndBump();
    finishRelief(c, { cavity: 1, cavityRough: 0.2 });
    const pit = 8 * c.w + 64;
    const bump = 8 * c.w + 192;
    const flat = 2 * c.w + 128;
    expect(c.occl[pit] ?? 1).toBeLessThan(0.6);
    expect(c.occl[bump]).toBe(1);
    expect(c.occl[flat]).toBe(1);
    expect(c.rough[pit] ?? 0).toBeGreaterThan(0.9);
    expect(c.rough[bump] ?? 1).toBeLessThan(0.75);
  });
});

describe('curvature', () => {
  it('is negative in a pit, positive on a bump, zero on a flat', () => {
    const c = pitAndBump();
    const k = curvature(c, 0.006);
    expect(k[8 * c.w + 64] ?? 0).toBeLessThan(0);
    expect(k[8 * c.w + 192] ?? 0).toBeGreaterThan(0);
    expect(k[2 * c.w + 128]).toBe(0);
  });
});

describe('relief samplers', () => {
  const c = strip();
  const cell = { f1: 0, f2: 0, id: 0 };

  it('tile along U and are deterministic', () => {
    for (const ym of [0.01, 0.2, 0.37]) {
      expect(fineNoise(c, 2.05, ym, 0.6, 0, 3)).toBeCloseTo(fineNoise(c, 0.05, ym, 0.6, 0, 3), 9);
      expect(isoNoise(c, 2.3, ym, 0.01, 4)).toBeCloseTo(isoNoise(c, 0.3, ym, 0.01, 4), 9);
      expect(rowNoise(c, 2.1, 5, 0.1, 5)).toBeCloseTo(rowNoise(c, 0.1, 5, 0.1, 5), 9);
      const a = worley(c, 1.99, ym, 0.05, 6, cell).f1;
      expect(worley(c, 3.99, ym, 0.05, 6, cell).f1).toBeCloseTo(a, 9);
    }
  });

  it('isoNoise never resolves below the coarse V texel (no vertical dashes)', () => {
    // V texel is 0.5/16 = 31 mm; a 2 mm request must still vary slowly along U.
    let jump = 0;
    for (let x = 0; x < 200; x++) {
      const xm = (x + 0.5) * (2 / 256);
      jump = Math.max(
        jump,
        Math.abs(isoNoise(c, xm + 2 / 256, 0.2, 0.002, 7) - isoNoise(c, xm, 0.2, 0.002, 7)),
      );
    }
    expect(jump).toBeLessThan(0.35);
  });

  it('rowNoise rows are independent: neighbouring rows differ', () => {
    let diff = 0;
    for (let x = 0; x < 64; x++)
      diff += Math.abs(rowNoise(c, x * 0.03, 3, 0.1, 9) - rowNoise(c, x * 0.03, 4, 0.1, 9));
    expect(diff / 64).toBeGreaterThan(0.05);
  });
});
