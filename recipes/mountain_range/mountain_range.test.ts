// The built tile. Failure first: the mesh's boundary must be the field itself at every LOD (an edge
// eased or lowered toward the floor leaves a notch wherever two tiles meet), the skirt's top must
// be the surface's own border row (no seam, no saw-tooth of its own), and the far LOD stays in the
// terrain band.

import { describe, expect, it } from 'bun:test';
import { compile, createRng, type Lod, type Mesh, sampler, type Vec3 } from '@developerz.ai/ts23d';
import { RECT, tileField } from './field.ts';
import {
  mountain_range,
  mountain_range_b,
  mountain_range_c,
  mountainRange,
  VARIANTS,
} from './mountain_range.ts';

const field = sampler(
  tileField(createRng(VARIANTS.mountain_range.seed), {
    ...mountainRange.defaults,
    ...VARIANTS.mountain_range.params,
  }),
);
const SIDE = 0.05;
const onCut = (x: number, y: number): boolean =>
  Math.abs(Math.abs(x) - RECT[2]) < 1e-3 || Math.abs(Math.abs(y) - RECT[3]) < 1e-3;
/** Plan position to the centimetre: the skirt and surface rows are matched on it. */
const key = (x: number, y: number): string => `${Math.round(x * 100)},${Math.round(y * 100)}`;

/** The surface's border vertices and the skirt's top vertices, keyed by plan position. */
function edges(m: Mesh): { surface: Map<string, Vec3>; skirt: Map<string, Vec3> } {
  const surface = new Map<string, Vec3>();
  const skirt = new Map<string, Vec3>();
  for (let i = 0; i < m.positions.length / 3; i++) {
    const [x, y, z] = [
      m.positions[i * 3] ?? 0,
      m.positions[i * 3 + 1] ?? 0,
      m.positions[i * 3 + 2] ?? 0,
    ];
    if (!onCut(x, y)) continue;
    if (Math.abs(m.normals[i * 3 + 2] ?? 0) >= SIDE) surface.set(key(x, y), [x, y, z]);
    else if (z > 1e-3) skirt.set(key(x, y), [x, y, z]);
  }
  return { surface, skirt };
}

describe.each([0, 1, 2] as Lod[])('mountain_range LOD%i', (lod) => {
  const c = compile(mountain_range, { lod });
  const terrain = c.parts.find((p) => p.name === 'terrain')?.mesh;
  if (!terrain) throw new Error('no terrain part');
  const { surface, skirt } = edges(terrain);
  const cells = [256, 128, 38][lod] ?? 0;

  it('has the boundary of the untouched field (neighbour tiles meet flush)', () => {
    expect(surface.size).toBe(4 * cells);
    // Float32 positions: within a few ulps of the field's height at that very point.
    for (const [x, y, z] of surface.values()) expect(Math.abs(z - field(x, y))).toBeLessThan(2e-4);
  });
  it("tops the skirt with the surface's own border row", () => {
    expect(skirt.size).toBe(surface.size);
    for (const [k, p] of skirt) expect(p).toEqual(surface.get(k) ?? [Number.NaN, 0, 0]);
  });
  it('stays in its triangle budget', () => {
    const tris = c.parts.reduce((s, p) => s + (p.mesh ? p.mesh.indices.length / 3 : 0), 0);
    expect(tris).toBeLessThanOrEqual([140000, 40000, 4000][lod] ?? 0);
  });
});

describe('mountain_range far snow', () => {
  // Failure first: each far vertex took the mean colour of only ±0.75 of its 53 m cell, so a crisp
  // snowfield edge switched from one vertex to the next and rendered as stepped white squares
  // (adjacent luminance p99 ≈ 0.35). Over ±2 cells the edge blends across the far cells.
  for (const asset of [mountain_range, mountain_range_b, mountain_range_c])
    it(`${asset.name}: neighbouring LOD2 surface vertices differ by < 0.25 luminance (p99)`, () => {
      const m = compile(asset, { lod: 2 }).parts.find((p) => p.name === 'terrain')?.mesh;
      if (!m) throw new Error('no terrain part');
      // The surface grid leads the mesh (the skirt follows it): its side is its first row's length,
      // read from the mesh, and every (i, j) is checked to sit on that grid, so the neighbours
      // compared below are neighbours on the ground whatever the far LOD's cell count.
      const P = m.positions;
      let n = 1;
      while (P[n * 3 + 1] === P[1] && (P[n * 3] ?? 0) > (P[(n - 1) * 3] ?? 0)) n++;
      expect(n).toBeGreaterThan(8);
      expect(n * n).toBeLessThanOrEqual(P.length / 3);
      const [dx, dy] = [(P[3] ?? 0) - (P[0] ?? 0), (P[n * 3 + 1] ?? 0) - (P[1] ?? 0)];
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const k = j * n + i;
          expect(Math.abs((P[k * 3] ?? 0) - (P[0] ?? 0) - i * dx)).toBeLessThan(1e-2);
          expect(Math.abs((P[k * 3 + 1] ?? 0) - (P[1] ?? 0) - j * dy)).toBeLessThan(1e-2);
        }
      const luma = (k: number): number =>
        0.2126 * (m.colors[k * 3] ?? 0) +
        0.7152 * (m.colors[k * 3 + 1] ?? 0) +
        0.0722 * (m.colors[k * 3 + 2] ?? 0);
      const steps: number[] = [];
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          if (i + 1 < n) steps.push(Math.abs(luma(j * n + i) - luma(j * n + i + 1)));
          if (j + 1 < n) steps.push(Math.abs(luma(j * n + i) - luma((j + 1) * n + i)));
        }
      steps.sort((a, b) => b - a);
      expect(steps[Math.floor(steps.length * 0.01)] ?? 1).toBeLessThan(0.25);
    });
});
