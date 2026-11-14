import { describe, expect, it } from 'bun:test';
import { type Mesh, triangleCount, type Vec2 } from '../core/index.ts';
import { stripRect } from '../material/index.ts';
import { openEdges, windingFlips, zeroArea } from './closed.ts';
import { lathe } from './lathe.ts';
import { stripVMetres } from './strip-uv.ts';

const C = [1, 1, 1] as const;
const TANK: Vec2[] = [
  [1.5, 0],
  [1.5, 4],
  [0.8, 4.6],
];

describe('lathe options', () => {
  it('faceted: flat normal per segment, perpendicular to its facet, same triangle count', () => {
    const smooth = lathe({ profile: TANK, segments: 8, color: C });
    const flat = lathe({ profile: TANK, segments: 8, color: C, faceted: true });
    expect(triangleCount(flat)).toBe(triangleCount(smooth));
    expect(windingFlips(flat)).toBe(0);
    // Every triangle's three normals are equal and perpendicular to its edges.
    const P = flat.positions;
    const N = flat.normals;
    for (let t = 0; t < flat.indices.length; t += 3) {
      const [a = 0, b = 0, c = 0] = [flat.indices[t], flat.indices[t + 1], flat.indices[t + 2]].map(
        (i) => (i ?? 0) * 3,
      );
      for (let k = 0; k < 3; k++) expect(N[a + k]).toBeCloseTo(N[b + k] ?? 0, 6);
      for (const e of [b, c]) {
        const d = [0, 1, 2].reduce(
          (s, k) => s + ((P[e + k] ?? 0) - (P[a + k] ?? 0)) * (N[a + k] ?? 0),
          0,
        );
        expect(Math.abs(d)).toBeLessThan(1e-5);
      }
    }
    // Smooth shading shares normals across segments: the faceted one does not.
    expect(flat.positions.length).toBeGreaterThan(smooth.positions.length);
  });

  it('faceted caps close the solid', () => {
    const m = lathe({ profile: TANK, segments: 6, color: C, faceted: true, caps: true });
    expect(openEdges(m)).toBe(0);
    expect(windingFlips(m)).toBe(0);
  });

  it("uv 'metres': U = arc length around, V mirrored along the profile, inside the strip", () => {
    const strip = 'wood';
    const r = stripRect(strip);
    const m = lathe({ profile: TANK, segments: 16, color: C, strip, uv: 'metres' });
    const us = [...m.uvs.filter((_, i) => i % 2 === 0)];
    // Full circumference at r 1.5 = 3π m, in strip widths of r.metres.
    expect(Math.max(...us)).toBeCloseTo((Math.PI * 2 * 1.5) / r.metres, 5);
    for (let i = 1; i < m.uvs.length; i += 2) {
      expect(m.uvs[i] ?? 0).toBeGreaterThan(r.v0);
      expect(m.uvs[i] ?? 1).toBeLessThan(r.v1);
    }
    // A 4 m wall spans several strip bands, not one stretched band.
    expect(4 / stripVMetres(strip)).toBeGreaterThan(2);
    const stretch: Mesh = lathe({ profile: TANK, segments: 16, color: C, strip });
    expect(Math.max(...stretch.uvs.filter((_, i) => i % 2 === 0))).toBeCloseTo(1, 6);
  });
});

describe('lathe input', () => {
  it('rejects segment counts that build NaN, empty or malformed rings', () => {
    for (const segments of [0, -3, 2.5, 2, 1025, Number.NaN])
      expect(() => lathe({ profile: TANK, segments, color: C })).toThrow('T3D_RECIPE_INVALID');
  });

  it('rejects a profile with a NaN point, a negative radius, no radius or one point', () => {
    const bad: Vec2[][] = [
      [
        [1, 0],
        [Number.NaN, 1],
      ],
      [
        [1, 0],
        [-0.5, 1],
      ],
      [
        [0, 0],
        [0, 1],
      ],
      [[1, 0]],
    ];
    for (const profile of bad)
      expect(() => lathe({ profile, segments: 8, color: C })).toThrow('T3D_RECIPE_INVALID');
  });

  it('accepts a profile that closes onto the axis (a dome)', () => {
    const dome: Vec2[] = [
      [1, 0],
      [0.7, 0.7],
      [0, 1],
    ];
    // 6 on the lower band, 3 on the tip band: the pole emits no zero-area slivers.
    expect(triangleCount(lathe({ profile: dome, segments: 3, color: C }))).toBe(9);
  });
});

describe('lathe poles', () => {
  const cone: Vec2[] = [
    [0, 0],
    [0.5, 0],
    [0.3, 1],
    [0, 1.2],
  ];
  it('a profile that starts and ends on the axis emits no zero-area triangles', () => {
    const m = lathe({ profile: cone, segments: 12, color: [1, 1, 1] });
    expect(zeroArea(m)).toBe(0);
    // Each pole band keeps one triangle per segment: 12 + 2 × 12 + 12.
    expect(triangleCount(m)).toBe(48);
  });

  it('caps on a zero radius are skipped, not a fan of slivers', () => {
    const m = lathe({ profile: cone, segments: 8, color: [1, 1, 1], caps: true });
    expect(zeroArea(m)).toBe(0);
  });

  it('a pole lathe is still closed and consistently wound', () => {
    const m = lathe({ profile: cone, segments: 12, color: [1, 1, 1] });
    expect(windingFlips(m)).toBe(0);
  });
});

describe('lathe degenerate profiles', () => {
  it('a repeated profile point (a zero-length segment) emits no band of slivers', () => {
    // The flange at LOD1/2: its chamfer collapses to two equal points.
    const ring: Vec2[] = [
      [0.05, 0],
      [0.1, 0],
      [0.1, 0],
      [0.1, 0.02],
      [0.05, 0.02],
      [0.05, 0],
    ];
    for (const faceted of [false, true]) {
      const m = lathe({ profile: ring, segments: 10, color: [1, 1, 1], faceted });
      expect(zeroArea(m)).toBe(0);
      expect(triangleCount(m)).toBe(4 * 2 * 10);
    }
  });

  it('a radius that is 0 up to rounding (sin π) is a pole, not a ring of slivers', () => {
    const pouf: Vec2[] = Array.from({ length: 7 }, (_, i) => {
      const a = (Math.PI * i) / 6;
      return [0.19 * Math.sin(a) ** 0.6, 0.075 - 0.075 * Math.cos(a)] as Vec2;
    });
    for (const faceted of [false, true]) {
      const m = lathe({ profile: pouf, segments: 12, color: [1, 1, 1], faceted });
      expect(zeroArea(m)).toBe(0);
    }
  });

  it('a profile of one repeated point still throws', () => {
    expect(() =>
      lathe({
        profile: [
          [0.1, 0],
          [0.1, 0],
        ],
        segments: 8,
        color: [1, 1, 1],
      }),
    ).toThrow('T3D_');
  });
});
