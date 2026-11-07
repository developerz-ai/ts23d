import { describe, expect, it } from 'bun:test';
import { boundsOf, type Mesh, Ts23dError, triangleCount } from '../core/index.ts';
import { stripRect } from '../material/index.ts';
import { box } from './box.ts';
import { openEdges } from './closed.ts';
import { cylinder } from './lathe.ts';

describe('box', () => {
  it('stands on the ground with the given size', () => {
    const m = box({ size: [2, 1, 3], color: [1, 1, 1] });
    expect(boundsOf(m)).toEqual({ min: [-1, -0.5, 0], max: [1, 0.5, 3] });
    expect(triangleCount(m)).toBe(12);
  });

  it('omits hidden faces', () => {
    expect(triangleCount(box({ size: [1, 1, 1], color: [1, 1, 1], omit: ['bottom'] }))).toBe(10);
  });
});

const sha = (m: Mesh): string => {
  const h = new Bun.CryptoHasher('sha256');
  for (const a of [m.positions, m.normals, m.uvs, m.colors, m.indices])
    h.update(new Uint8Array(a.buffer));
  return h.digest('hex');
};

describe('box bevel', () => {
  const brick = {
    size: [2, 1, 3],
    color: [0.5, 0.25, 0.125],
    strip: 'brick',
    at: [1, 2, 3],
  } as const;

  it('throws T3D_RECIPE_INVALID with a fix when the bevel does not fit', () => {
    for (const bevel of [0.5, 0.6, -0.01, Number.NaN]) {
      try {
        box({ ...brick, bevel });
        throw new Error(`bevel ${bevel} should throw`);
      } catch (e) {
        expect(e).toBeInstanceOf(Ts23dError);
        if (e instanceof Ts23dError) {
          expect(e.code).toBe('T3D_RECIPE_INVALID');
          expect(e.fix).toContain('half the smallest size');
        }
      }
    }
  });

  it('bevel 0 is byte-identical to the unbevelled box (pinned before bevel landed)', () => {
    // Re-pinned when the trim sheet moved to 2048² (strip rows shifted the UVs; geometry unchanged).
    const before = 'd23c46e6431f313c69855ff3c47d7270c595eb0e218d39e1c39ee4023284d4e4';
    expect(sha(box({ ...brick, omit: ['bottom'] }))).toBe(before);
    expect(sha(box({ ...brick, omit: ['bottom'], bevel: 0 }))).toBe(before);
  });

  it('chamfers every edge: 44 triangles, same bounds, closed and outward', () => {
    const m = box({ ...brick, bevel: 0.05 });
    expect(triangleCount(m)).toBe(6 * 2 + 12 * 2 + 8);
    expect(boundsOf(m)).toEqual(boundsOf(box(brick)));
    expect(openEdges(m)).toBe(0);
    expect(triangleCount(box({ ...brick, bevel: 0.05, omit: ['bottom'] }))).toBe(42);
    // Every normal points away from the box centre (1, 2, 4.5).
    for (let i = 0; i < m.positions.length; i += 3) {
      const d = [
        (m.positions[i] ?? 0) - 1,
        (m.positions[i + 1] ?? 0) - 2,
        (m.positions[i + 2] ?? 0) - 4.5,
      ];
      expect(d.reduce((s, x, k) => s + x * (m.normals[i + k] ?? 0), 0)).toBeGreaterThan(0);
    }
    const r = stripRect('brick');
    for (let i = 1; i < m.uvs.length; i += 2) {
      expect(m.uvs[i] ?? -1).toBeGreaterThanOrEqual(r.v0 - 1e-6);
      expect(m.uvs[i] ?? 2).toBeLessThanOrEqual(r.v1 + 1e-6);
    }
    // The 12 chamfer quads carry 45° normals.
    let diagonal = 0;
    for (let i = 0; i < m.normals.length; i += 3) {
      const zeros = [0, 1, 2].filter((k) => Math.abs(m.normals[i + k] ?? 0) < 1e-6).length;
      if (zeros === 1) diagonal++;
    }
    expect(diagonal).toBe(12 * 4);
  });

  it('is deterministic', () => {
    expect(box({ ...brick, bevel: 0.02 })).toEqual(box({ ...brick, bevel: 0.02 }));
  });
});

describe('cylinder', () => {
  it('scales triangles with segments (the LOD knob)', () => {
    const lo = cylinder({ radius: 1, length: 1, segments: 8, color: [1, 1, 1] });
    const hi = cylinder({ radius: 1, length: 1, segments: 32, color: [1, 1, 1] });
    expect(triangleCount(hi)).toBe(4 * triangleCount(lo));
  });
});
