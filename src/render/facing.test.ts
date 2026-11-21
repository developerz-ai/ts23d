import { describe, expect, it } from 'bun:test';
import { seenFromBehind } from './facing.ts';

// A triangle in the z = 0 plane, wound counter-clockwise seen from +z.
const CCW = [0, 0, 0, 1, 0, 0, 0, 1, 0];
const CW = [0, 0, 0, 0, 1, 0, 1, 0, 0];
const side = (P: number[], n: readonly number[], v: readonly number[]): boolean =>
  seenFromBehind(P, 0, 3, 6, n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);

describe('seenFromBehind (D610)', () => {
  // Grazing view from just above the plane; the smooth normal has tipped away from the eye.
  const eye = [0.995, 0, 0.1] as const;
  const tipped = [-0.6, 0, 0.8] as const;

  it('a tipped normal on a triangle that faces the eye is still its front', () => {
    expect(tipped[0] * eye[0] + tipped[2] * eye[2]).toBeLessThan(0);
    expect(side(CCW, tipped, eye)).toBe(false);
  });

  it('the far side of the triangle is its back', () => {
    expect(side(CCW, [0, 0, 1], [0, 0, -1])).toBe(true);
    expect(side(CCW, tipped, [0.995, 0, -0.1])).toBe(true);
  });

  it('gives the same answers on a mesh wound against its normals', () => {
    expect(side(CW, tipped, eye)).toBe(false);
    expect(side(CW, [0, 0, 1], [0, 0, 1])).toBe(false);
    expect(side(CW, [0, 0, 1], [0, 0, -1])).toBe(true);
  });
});
