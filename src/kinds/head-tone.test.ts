import { describe, expect, it } from 'bun:test';
import type { Vec3 } from '../core/index.ts';
import { toned } from './head-tone.ts';

// Two unit spheres overlapping along X: a crease runs round x = 0 where they meet.
const sphere = (c: number) => (q: Vec3) => Math.hypot(q[0] - c, q[1], q[2]) - 1;
const pair = (q: Vec3): number => Math.min(sphere(-0.7)(q), sphere(0.7)(q));
const grey = (): Vec3 => [0.5, 0.5, 0.5];
const lum = (c: Vec3): number => c[0] + c[1] + c[2];

describe('toned', () => {
  it('leaves colour untouched at strength 0 (and stays in 0…1)', () => {
    const f = toned(pair, grey, { reach: 0.3, strength: 0 });
    expect(f([0, 0.71, 0])).toEqual([0.5, 0.5, 0.5]);
    const full = toned(pair, () => [1, 1, 1], { reach: 0.3 });
    for (const c of full([0.7, 0, 1])) expect(c).toBeLessThanOrEqual(1);
  });

  it('darkens the crease, lifts and warms the top, cools the underside', () => {
    const f = toned(pair, grey, { reach: 0.3 });
    // The crease between the spheres (on the surface at x = 0) vs a side point with the same normal.
    const crease = f([0, Math.sqrt(1 - 0.49), 0]);
    const side = f([1.7, 0, 0]);
    expect(lum(crease)).toBeLessThan(lum(side) * 0.9);
    const top = f([0.7, 0, 1]);
    const under = f([0.7, 0, -1]);
    expect(lum(top)).toBeGreaterThan(lum(under));
    expect(top[0]).toBeGreaterThan(top[2]);
    expect(under[2]).toBeGreaterThan(under[0]);
  });
});
