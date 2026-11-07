import { describe, expect, it } from 'bun:test';
import { type Mesh, triangleCount, type Vec2 } from '../core/index.ts';
import { stripRect } from '../material/index.ts';
import { openEdges, windingFlips } from './closed.ts';
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
