// segment-contact: the exact nearest approach of a segment to triangles, and where it is.

import { describe, expect, it } from 'bun:test';
import type { Vec3 } from '../core/index.ts';
import { nearestOnSegment, pieceFor } from './segment-contact.ts';

/** One triangle in the plane z = 0: (0,0) (4,0) (0,4). */
const T = [0, 0, 0, 4, 0, 0, 0, 4, 0];
/** `nearestOnSegment` over every triangle of `tris` (no index: the list is the whole soup). */
const near = (p: Vec3, q: Vec3, eps = 0.005, reach = 0.02, tris: readonly number[] = T) =>
  nearestOnSegment(
    p,
    q,
    tris,
    () => Array.from({ length: tris.length / 9 }, (_, i) => i),
    eps,
    reach,
    0.25,
  );

describe('nearestOnSegment', () => {
  it('finds nothing for a segment that stays beyond reach, or crosses the plane off the face', () => {
    expect(near([1, 1, 0.03], [1.5, 1.2, 0.03])).toBeNull();
    expect(near([1, 1, 5], [1, 1, 0.021])).toBeNull();
    // Through the plane z = 0 at (3, 3): 0.71 m outside the hypotenuse.
    expect(near([3, 3, -1], [3, 3, 1])).toBeNull();
    // An empty candidate list is no contact, not a crash.
    expect(nearestOnSegment([1, 1, -1], [1, 1, 1], T, () => [], 0.005, 0.02, 0.25)).toBeNull();
  });

  it('reports a hover: the true gap of a parallel run, an end, and a pass beside a side', () => {
    expect(near([1, 1, 0.01], [1.5, 1.2, 0.01])?.gap).toBeCloseTo(0.01, 9);
    const end = near([1, 1, 5], [1, 1, 0.012]);
    expect(end?.gap).toBeCloseTo(0.012, 9);
    expect(end?.at[2]).toBeCloseTo(0.012, 9);
    // Crosses the plane 1.5 cm outside the side y = 0, far from all three corners.
    const beside = near([2, -0.015, -1], [2, -0.015, 1]);
    expect(beside?.gap).toBeCloseTo(0.015, 9);
    expect(beside?.at[2]).toBeCloseTo(0, 9);
  });

  it('is 0 where a segment of any length passes through the face, far from its corners', () => {
    for (const len of [0.01, 1, 400]) {
      const hit = near([1 - len, 1 - len / 2, len], [1 + len, 1 + len / 2, -len]);
      expect(hit?.gap).toBe(0);
      for (const k of [0, 1, 2] as const) expect(hit?.at[k]).toBeCloseTo([1, 1, 0][k] ?? 0, 6);
    }
  });

  it('counts a touch within the tolerance, and a pass through a side or a corner', () => {
    expect(near([1, 1, 5], [1, 1, 0.004])?.gap).toBeCloseTo(0.004, 9);
    expect(near([2, 0, -1], [2, 0, 1])?.gap).toBeCloseTo(0, 9);
    expect(near([0, 0, -1], [0, 0, 1])?.gap).toBeCloseTo(0, 9);
    // In the face's own plane, running across it.
    expect(near([-1, 1, 0], [5, 1, 0])?.gap).toBeCloseTo(0, 9);
  });

  it('survives a zero-length segment and a zero-area triangle', () => {
    expect(near([1, 1, 0.01], [1, 1, 0.01])?.gap).toBeCloseTo(0.01, 9);
    const sliver = [0, 0, 0, 2, 0, 0, 4, 0, 0];
    expect(near([1, -1, 0.01], [1, 1, 0.01], 0.005, 0.02, sliver)?.gap).toBeCloseTo(0.01, 9);
    expect(near([1, 1, 0.01], [1, 2, 0.01], 0.005, 0.02, sliver)).toBeNull();
  });

  it('stops at the first triangle within the tolerance, else keeps the nearest', () => {
    const two = [...T, ...T.map((v, i) => (i % 3 === 2 ? v + 0.03 : v))];
    // 1 cm under the upper face, 2 cm over the lower: neither touches, the upper is nearer.
    expect(near([1, 1, 0.02], [1.5, 1, 0.02], 0.005, 0.02, two)?.gap).toBeCloseTo(0.01, 6);
    // Through both: the lower one (first in the list) ends the search.
    expect(near([1, 1, -1], [1, 1, 1], 0.005, 0.02, two)?.at[2]).toBeCloseTo(0, 9);
  });
});

describe('pieceFor', () => {
  it('never goes under 25 cm and cuts a big partner into at most 64', () => {
    expect(pieceFor(3)).toBe(0.25);
    expect(pieceFor(640)).toBe(10);
  });
});
