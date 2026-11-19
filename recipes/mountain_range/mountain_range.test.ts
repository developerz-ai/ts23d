// The built tile. Failure first: the mesh's boundary must be the field itself at every LOD (an edge
// eased or lowered toward the floor leaves a notch wherever two tiles meet), the skirt's top must
// be the surface's own border row (no seam, no saw-tooth of its own), and the far LOD stays in the
// terrain band.

import { describe, expect, it } from 'bun:test';
import { compile, createRng, type Lod, type Mesh, sampler, type Vec3 } from '@developerz.ai/ts23d';
import { RECT, tileField } from './field.ts';
import { mountain_range, mountainRange, VARIANTS } from './mountain_range.ts';

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
