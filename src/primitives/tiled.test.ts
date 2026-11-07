import { describe, expect, it } from 'bun:test';
import { boundsOf, type Mesh, Ts23dError, triangleCount } from '../core/index.ts';
import { stripRect } from '../material/index.ts';
import { stripVMetres } from './strip-uv.ts';
import { tiled } from './tiled.ts';

const C = [0.6, 0.3, 0.2] as const;

const fails = (f: () => unknown): Ts23dError => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('expected a Ts23dError');
};

const wall = (extra: Partial<Parameters<typeof tiled>[0]> = {}): Mesh =>
  tiled({ origin: [0, 0, 0], u: [0, 4, 0], v: [0, 0, 3], color: C, strip: 'brick', ...extra });

describe('tiled', () => {
  it('throws T3D_RECIPE_INVALID with a fix on degenerate input', () => {
    const flat = fails(() => wall({ v: [0, 0, 0] }));
    expect(flat.code).toBe('T3D_RECIPE_INVALID');
    expect(flat.fix).toContain('non-zero');
    expect(fails(() => wall({ v: [0, 2, 0] })).fix).toContain('perpendicular');
    expect(fails(() => wall({ segments: 0 })).fix).toContain('whole number');
    expect(fails(() => wall({ vMetres: -1 })).code).toBe('T3D_RECIPE_INVALID');
  });

  it('spans origin + u + v exactly', () => {
    expect(boundsOf(wall({ origin: [1, -2, 0.5] }))).toEqual({
      min: [1, -2, 0.5],
      max: [1, 2, 3.5],
    });
  });

  it('triangles = 2 · segments · bands · sides, bands = ⌈|v| / vMetres⌉', () => {
    const bands = Math.ceil(3 / stripVMetres('brick'));
    expect(triangleCount(wall())).toBe(2 * bands);
    expect(triangleCount(wall({ segments: 3 }))).toBe(6 * bands);
    expect(triangleCount(wall({ vMetres: 3 }))).toBe(2);
    expect(triangleCount(wall({ vMetres: 3, doubleSided: true }))).toBe(4);
    // A phase shift that splits the face mid-band adds one band.
    expect(triangleCount(wall({ vMetres: 2, vOffset: 0.5 }))).toBe(4);
  });

  it('faces u × v with CCW winding (+X here)', () => {
    const m = wall();
    for (let i = 0; i < m.normals.length; i += 3) expect(m.normals[i]).toBeCloseTo(1, 6);
    const [a = 0, b = 0, c = 0] = m.indices;
    const p = (k: number, j: number): number => m.positions[k * 3 + j] ?? 0;
    const e1 = [p(b, 1) - p(a, 1), p(b, 2) - p(a, 2)];
    const e2 = [p(c, 1) - p(a, 1), p(c, 2) - p(a, 2)];
    expect((e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0)).toBeGreaterThan(0);
  });

  it('keeps V inside the strip and U at true metres', () => {
    const r = stripRect('brick');
    const m = wall({ uOffset: 1 });
    for (let i = 1; i < m.uvs.length; i += 2) {
      expect(m.uvs[i] ?? 0).toBeGreaterThan(r.v0);
      expect(m.uvs[i] ?? 1).toBeLessThan(r.v1);
    }
    const us = [...m.uvs.filter((_, i) => i % 2 === 0)];
    expect(Math.min(...us)).toBeCloseTo(1 / r.metres, 6);
    expect(Math.max(...us)).toBeCloseTo(5 / r.metres, 6);
  });

  it('is deterministic', () => {
    expect(wall({ segments: 2, vOffset: 0.2 })).toEqual(wall({ segments: 2, vOffset: 0.2 }));
  });
});
