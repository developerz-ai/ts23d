import { describe, expect, it } from 'bun:test';
import { boundsOf, type Mesh, Ts23dError, triangleCount } from '../core/index.ts';
import { windingFlips } from './closed.ts';
import { measureText, type TextOptions, text } from './text.ts';
import { layout } from './text-layout.ts';

const C = [1, 1, 1] as const;
const fails = (f: () => unknown): Ts23dError => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('expected a Ts23dError');
};
const sign = (s: string, o: Partial<TextOptions> = {}): Mesh =>
  text(s, { origin: [0, 0, 0], height: 0.7, color: C, ...o });

describe('text', () => {
  it('throws T3D_RECIPE_INVALID listing the supported characters for an unknown glyph', () => {
    const e = fails(() => sign('CAFÉ'));
    expect(e.code).toBe('T3D_RECIPE_INVALID');
    expect(e.message).toContain('U+00C9');
    expect(e.fix).toContain('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
    expect(e.fix).toContain('АБВ');
    expect(fails(() => measureText('~', { height: 1 })).code).toBe('T3D_RECIPE_INVALID');
    expect(fails(() => sign('A', { height: 0 })).fix).toContain('> 0');
    expect(fails(() => sign('A', { height: Number.NaN })).code).toBe('T3D_RECIPE_INVALID');
    expect(fails(() => sign('A', { depth: -1 })).code).toBe('T3D_RECIPE_INVALID');
    expect(fails(() => sign('A', { up: [0, 2, 0] })).fix).toContain('perpendicular');
  });

  it('measureText = 5 px per glyph + 1 px tracking (block 6), space 3, at height / 7 per px', () => {
    expect(measureText('AB', { height: 0.7 })).toBeCloseTo(1.1, 9);
    expect(measureText('A B', { height: 0.7, tracking: 2 })).toBeCloseTo(1.7, 9);
    expect(measureText('AB', { height: 0.7, font: 'block' })).toBeCloseTo(1.3, 9);
    expect(measureText('', { height: 0.7 })).toBe(0);
  });

  it('bounds match measureText, cap height, align and the 2 mm lift', () => {
    const w = measureText('CLINCHFIELD', { height: 0.7 });
    const b = boundsOf(sign('CLINCHFIELD'));
    expect(b.min[1]).toBeCloseTo(0, 5);
    expect(b.max[1]).toBeCloseTo(w, 5);
    expect(b.min[2]).toBeCloseTo(0, 5);
    expect(b.max[2]).toBeCloseTo(0.7, 5);
    expect(b.max[0]).toBeCloseTo(0.002, 6);
    const c = boundsOf(sign('CLINCHFIELD', { align: 'centre' }));
    expect(c.min[1]).toBeCloseTo(-w / 2, 5);
    expect(boundsOf(sign('8', { align: 'right' })).max[1]).toBeCloseTo(0, 5);
    // maxWidth shrinks the cap height to fit.
    const fit = boundsOf(sign('CLINCHFIELD', { maxWidth: 2 }));
    expect(fit.max[1] - fit.min[1]).toBeCloseTo(2, 5);
    expect(fit.max[2]).toBeCloseTo((0.7 * 2) / w, 5);
  });

  it('merges pixel runs: triangles = 2 · rects flush, 10 · rects raised', () => {
    // I: top bar, stem, bottom bar = 3 rectangles; L: stem + foot = 2; O: 4 sides + ... (counted).
    expect(layout('I', '5x7', 1).rects).toHaveLength(3);
    expect(layout('L', '5x7', 1).rects).toHaveLength(2);
    const r = layout('CLINCHFIELD 8424', '5x7', 1).rects.length;
    expect(triangleCount(sign('CLINCHFIELD 8424'))).toBe(2 * r);
    expect(triangleCount(sign('CLINCHFIELD 8424', { depth: 0.01 }))).toBe(10 * r);
    expect(r).toBeLessThan(16 * 12); // far fewer than one quad per pixel
  });

  it('faces along × up, raised letters wound outward, Cyrillic and lower case set', () => {
    const m = sign('Т-34 ЗА РОДИНУ', { depth: 0.02 });
    expect(windingFlips(m)).toBe(0);
    expect(m.normals[0]).toBeCloseTo(1, 6);
    expect(sign('abc')).toEqual(sign('ABC'));
  });

  it('follows a stepped surface: pieces split and lift where the face steps out', () => {
    // Posts 0.05 m proud between u = 0.4 and 0.6.
    const surface = (u: number): number => (u > 0.4 && u < 0.6 ? 0.05 : 0);
    const flat = sign('HHH');
    const stepped = sign('HHH', { surface });
    expect(triangleCount(stepped)).toBeGreaterThan(triangleCount(flat));
    for (let i = 0; i < stepped.positions.length; i += 3) {
      const u = stepped.positions[i + 1] ?? 0;
      const x = stepped.positions[i] ?? 0;
      if (u > 0.41 && u < 0.59) expect(x).toBeCloseTo(0.052, 6);
      if (u < 0.39 || u > 0.61) expect(x).toBeCloseTo(0.002, 6);
    }
  });

  it('is deterministic', () => {
    expect(sign('C.C.& O. 8424', { depth: 0.01, font: 'block' })).toEqual(
      sign('C.C.& O. 8424', { depth: 0.01, font: 'block' }),
    );
  });
});
