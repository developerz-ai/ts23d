// Sill streaks. Failure first: a stain that is the same rectangle under every window (as wide at
// its foot as under the sill, one darkness) reads as a stamped decal, not water-borne soot.

import { describe, expect, it } from 'bun:test';
import type { Mesh, Vec3 } from '@developerz.ai/ts23d';
import { sillStreak } from './wear.ts';

const WALL: Vec3 = [0.8, 0.75, 0.7];

/** Width of the streak at height z (its vertices there), m. */
function widthAt(m: Mesh, z: number): number {
  const ys: number[] = [];
  for (let i = 0; i < m.positions.length / 3; i++)
    if (Math.abs((m.positions[i * 3 + 2] ?? 0) - z) < 1e-6) ys.push(m.positions[i * 3 + 1] ?? 0);
  return Math.max(...ys) - Math.min(...ys);
}

/** Darkest vertex value (mean of RGB). */
function darkest(m: Mesh): number {
  let d = 1;
  for (let i = 0; i < m.colors.length / 3; i++)
    d = Math.min(
      d,
      ((m.colors[i * 3] ?? 0) + (m.colors[i * 3 + 1] ?? 0) + (m.colors[i * 3 + 2] ?? 0)) / 3,
    );
  return d;
}

describe('sillStreak', () => {
  it('tapers from the sill to a quarter of its width at the foot', () => {
    const m = sillStreak(0.8, 2, { wall: WALL, strip: 'brick' });
    expect(widthAt(m, 0)).toBeCloseTo(0.8, 6);
    expect(widthAt(m, -2)).toBeCloseTo(0.2, 6);
  });
  it('is as dark as its strength asks under the sill, and wall-coloured at its foot', () => {
    const faint = sillStreak(0.8, 2, { wall: WALL, strip: 'brick', strength: 0.4 });
    const heavy = sillStreak(0.8, 2, { wall: WALL, strip: 'brick', strength: 0.95 });
    expect(darkest(heavy)).toBeLessThan(darkest(faint) - 0.2);
    for (let i = 0; i < heavy.positions.length / 3; i++)
      if ((heavy.positions[i * 3 + 2] ?? 0) < -1.999)
        expect(heavy.colors[i * 3] ?? 0).toBeCloseTo(WALL[0], 6);
  });
});
