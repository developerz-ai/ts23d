import { describe, expect, it } from 'bun:test';
import { boundsOf, triangleCount } from '../core/index.ts';
import { beam } from './beam.ts';
import { planar } from './planar.ts';
import { prism } from './prism.ts';
import { triangulate } from './triangulate.ts';

describe('prism', () => {
  it('extrudes a side profile along Y, centred', () => {
    const m = prism({
      profile: [
        [0, 0],
        [4, 0],
        [5, 1],
        [-1, 1],
      ],
      depth: 2,
      plane: 'xz',
      color: [1, 1, 1],
    });
    expect(boundsOf(m)).toEqual({ min: [-1, -1, 0], max: [5, 1, 1] });
    expect(triangleCount(m)).toBe(4 * 2 + 2 * 2);
  });

  it('has outward side normals for either winding', () => {
    for (const profile of [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      [
        [0, 1],
        [1, 1],
        [1, 0],
        [0, 0],
      ],
    ] as [number, number][][]) {
      const m = prism({ profile, depth: 1, plane: 'xy', color: [1, 1, 1] });
      // First side quad runs along the first edge; its normal must point away from the centre.
      const p: [number, number] = [(m.positions[0] ?? 0) - 0.5, (m.positions[1] ?? 0) - 0.5];
      expect(p[0] * (m.normals[0] ?? 0) + p[1] * (m.normals[1] ?? 0)).toBeGreaterThan(0);
    }
  });
});

describe('beam', () => {
  it('spans from → to at any angle', () => {
    const m = beam({ from: [0, 0, 0], to: [3, 4, 0], width: 0.1, color: [1, 1, 1] });
    const b = boundsOf(m);
    expect(b.max[0]).toBeCloseTo(3.04, 1);
    expect(b.max[1]).toBeCloseTo(4.03, 1);
  });
});

describe('planar + triangulate', () => {
  it('triangulates a concave L', () => {
    expect(
      triangulate([
        [0, 0],
        [2, 0],
        [2, 1],
        [1, 1],
        [1, 2],
        [0, 2],
      ]),
    ).toHaveLength(4);
  });

  it('builds a double-sided sheet', () => {
    expect(
      triangleCount(
        planar({
          points: [
            [0, 0, 0],
            [1, 0, 0],
            [1, 1, 0],
            [0, 1, 0],
          ],
          color: [1, 1, 1],
          doubleSided: true,
        }),
      ),
    ).toBe(4);
  });
});
