import { describe, expect, it } from 'bun:test';
import type { Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import { probeLipschitz } from './sculpt-stroke.ts';
import { type BlendKernel, sd, shapes, smoothMin, smoothWeight } from './sdf-ops.ts';

/** Jump in d²/da² smin(a, 0) across a = −k (the blend's edge): 0 for a C2 kernel. */
function curvatureJump(kernel: BlendKernel, k: number): number {
  const e = 1e-3 * k;
  const f = (a: number): number => smoothMin(a, 0, k, kernel);
  const second = (a: number): number => (f(a + e) - 2 * f(a) + f(a - e)) / (e * e);
  return Math.abs(second(-k + 2 * e) - second(-k - 2 * e));
}

describe('blend kernels', () => {
  it("quad has a curvature jump at the blend's edge (the kink the cubic kernel removes)", () => {
    expect(curvatureJump('quad', 0.1)).toBeGreaterThan(1);
  });

  it('cubic is C2: second derivative continuous at the edge and at a = b', () => {
    expect(curvatureJump('cubic', 0.1)).toBeLessThan(0.05);
    const e = 1e-4;
    const f = (a: number): number => smoothMin(a, 0, 0.1, 'cubic');
    const second = (a: number): number => (f(a + e) - 2 * f(a) + f(a - e)) / (e * e);
    expect(Math.abs(second(2 * e) - second(-2 * e))).toBeLessThan(0.05);
  });

  it('weights are exactly 1 (or 0) past the blend width, so the sparse fold may skip', () => {
    for (const kernel of ['quad', 'cubic'] as const) {
      expect(smoothWeight(-0.2, 0, 0.1, kernel)).toBe(1);
      expect(smoothWeight(0.2, 0, 0.1, kernel)).toBe(0);
      expect(smoothMin(-0.2, 0, 0.1, kernel)).toBe(-0.2);
    }
    // Cubic undershoots less than quad at a = b: k/6 against k/4.
    expect(smoothMin(0, 0, 0.12, 'cubic')).toBeCloseTo(-0.02, 12);
    expect(smoothMin(0, 0, 0.12, 'quad')).toBeCloseTo(-0.03, 12);
  });

  it('smooth union and subtract stay 1-Lipschitz with both kernels', () => {
    const a = sd.sphere([0, 0, 0], 0.3);
    const b = sd.sphere([0.35, 0, 0], 0.2);
    for (const kernel of ['quad', 'cubic'] as const) {
      const bounds: [Vec3, Vec3] = [
        [-0.5, -0.4, -0.4],
        [0.7, 0.4, 0.4],
      ];
      expect(probeLipschitz(sd.smoothUnion(0.15, a, b, kernel), bounds, 1, 14).ok).toBe(true);
      expect(probeLipschitz(sd.smoothSubtract(0.1, a, b, kernel), bounds, 1, 14).ok).toBe(true);
    }
  });
});

describe('new shapes', () => {
  it('roundCone is the exact distance to the hull of its two spheres (outside points)', () => {
    const [r1, r2, h] = [0.3, 0.1, 1];
    // Hull of two balls = union of balls with lerped centre and radius.
    const brute = (x: number, y: number, z: number): number => {
      let d = Number.POSITIVE_INFINITY;
      for (let i = 0; i <= 20000; i++) {
        const t = i / 20000;
        d = Math.min(d, dmath.hypot(x, y, z - t * h) - (r1 + (r2 - r1) * t));
      }
      return d;
    };
    for (const p of [
      [0.5, 0, 0.5],
      [0, 0.2, -0.4],
      [0.1, 0.1, 1.3],
      [0.6, -0.3, 1.1],
      [0.4, 0, -0.1],
    ] as const)
      expect(shapes.roundCone(p[0], p[1], p[2], r1, r2, h)).toBeCloseTo(brute(p[0], p[1], p[2]), 4);
    expect(shapes.roundCone(0, 0, 0, r1, r2, h)).toBeCloseTo(-r1, 12);
    // One sphere swallows the other: the big sphere alone.
    expect(shapes.roundCone(0, 0, 2, 0.1, 1, 0.5)).toBeCloseTo(0.5, 12);
  });

  it('superellipsoid: n = 2 with equal axes is the sphere; zero on its surface; 1-Lipschitz', () => {
    expect(shapes.superellipsoid(0.7, 0.2, 0.1, 0.5, 0.5, 0.5, 2)).toBeCloseTo(
      shapes.sphere(0.7, 0.2, 0.1, 0.5),
      12,
    );
    // A boxy one reaches nearly the box corner direction.
    expect(shapes.superellipsoid(0.3, 0, 0, 0.3, 0.2, 0.1, 6)).toBeCloseTo(0, 12);
    const f = (p: Vec3): number => shapes.superellipsoid(p[0], p[1], p[2], 0.3, 0.2, 0.1, 6);
    const bounds: [Vec3, Vec3] = [
      [-0.5, -0.4, -0.3],
      [0.5, 0.4, 0.3],
    ];
    expect(probeLipschitz(f, bounds, 1, 16).ok).toBe(true);
  });
});
