import { describe, expect, it } from 'bun:test';
import { boundsOf, triangleCount } from '../core/index.ts';
import { stripRect } from '../material/index.ts';
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

describe('prism input', () => {
  const SQ: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  it('rejects a negative, zero or NaN depth (signed volume < 0)', () => {
    for (const depth of [-1, 0, Number.NaN])
      expect(() => prism({ profile: SQ, depth, color: [1, 1, 1] })).toThrow('T3D_RECIPE_INVALID');
  });

  it('rejects a profile with fewer than 3 points or a NaN point', () => {
    expect(() => prism({ profile: SQ.slice(0, 2), depth: 1, color: [1, 1, 1] })).toThrow(
      'T3D_RECIPE_INVALID',
    );
    expect(() =>
      prism({ profile: [...SQ.slice(0, 3), [Number.NaN, 1]], depth: 1, color: [1, 1, 1] }),
    ).toThrow('T3D_RECIPE_INVALID');
  });
});

describe('prism V', () => {
  const square = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ] as const;
  const sideVs = (depth: number): number[] => {
    const m = prism({ profile: square, depth, color: [1, 1, 1], caps: false });
    return [0, 1, 2, 3].map((k) => m.uvs[k * 2 + 1] ?? 0);
  };

  it('spans V up a side at whole-metre depths (every vertex had the same V at depth 1)', () => {
    for (const depth of [1, 2, 2.5]) {
      const [a = 0, , c = 0] = sideVs(depth);
      expect(c - a).toBeGreaterThan(1e-3);
    }
  });

  it('runs V the same way across a cap that crosses a whole metre (0.8…1.2 ran backwards)', () => {
    const m = prism({
      profile: [
        [0, 0.8],
        [1, 0.8],
        [1, 1.2],
        [0, 1.2],
      ],
      depth: 0.5,
      color: [1, 1, 1],
    });
    // Caps follow the four sides (4 vertices each): 16…19 is the first cap.
    const v = (k: number): number => m.uvs[(16 + k) * 2 + 1] ?? 0;
    expect(v(2)).toBeGreaterThan(v(1));
    expect(v(3)).toBeGreaterThan(v(0));
  });

  it('keeps the historical V of a face inside one band (no committed output moves)', () => {
    const r = stripRect('plain');
    const [a = 0, , c = 0] = sideVs(0.3);
    expect(a).toBe(Math.fround(r.v0));
    expect(c).toBe(Math.fround(r.v0 + (((0.3 % 1) + 1) % 1) * (r.v1 - r.v0)));
  });
});
