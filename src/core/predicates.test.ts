import { describe, expect, test } from 'bun:test';
import { orient2d, orient3d } from './predicates.ts';

describe('orient2d', () => {
  test('a point a hair off a long line gets the right side (naive float cross says 0 or flips)', () => {
    // Shewchuk's classic: points near (0.5, 0.5) on the line y = x, perturbed by 1 ulp steps.
    const naive = (px: number, py: number): number => (12 - 24) * (py - 24) - (12 - 24) * (px - 24);
    let wrong = 0;
    for (let i = 0; i < 64; i++)
      for (let j = 0; j < 64; j++) {
        const px = 0.5 + i * 2 ** -53;
        const py = 0.5 + j * 2 ** -53;
        const truth = Math.sign(py - px); // exact for these doubles (same exponent)
        expect(Math.sign(orient2d(12, 12, 24, 24, px, py))).toBe(truth);
        if (Math.sign(naive(px, py)) !== truth) wrong++;
      }
    expect(wrong).toBeGreaterThan(0);
  });
  test('ordinary triangles: sign of the cross product', () => {
    expect(orient2d(0, 0, 1, 0, 0, 1)).toBeGreaterThan(0);
    expect(orient2d(0, 0, 0, 1, 1, 0)).toBeLessThan(0);
    expect(orient2d(0, 0, 1, 1, 2, 2)).toBe(0);
    expect(orient2d(0, 0, 1e-300, 0, 0, 1e-300)).toBeGreaterThan(0);
  });
});

describe('orient3d', () => {
  test('a point above a CCW face is positive, below negative, on it zero', () => {
    const a = [0, 0, 0] as const;
    const b = [1, 0, 0] as const;
    const c = [0, 1, 0] as const;
    expect(orient3d(a, b, c, [0.2, 0.2, 1])).toBeGreaterThan(0);
    expect(orient3d(a, b, c, [0.2, 0.2, -1])).toBeLessThan(0);
    expect(orient3d(a, b, c, [5, -3, 0])).toBe(0);
  });
  test('exactly coplanar points far from the origin read 0, near-coplanar get the true sign', () => {
    const a = [1000.1, 2000.3, 0.7] as const;
    const b = [1003.7, 2000.9, 0.7] as const;
    const c = [1000.4, 2004.2, 0.7] as const;
    expect(orient3d(a, b, c, [1001.3, 2001.1, 0.7])).toBe(0);
    const up = 0.7 + 2 ** -52;
    expect(orient3d(a, b, c, [1001.3, 2001.1, up])).toBeGreaterThan(0);
    expect(orient3d(a, b, c, [1001.3, 2001.1, 0.7 - 2 ** -53])).toBeLessThan(0);
  });
});
