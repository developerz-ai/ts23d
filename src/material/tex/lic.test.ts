import { describe, expect, it } from 'bun:test';
import { type TexContext, TexField } from './field.ts';
import { fn } from './generators.ts';
import { material, probeGraph } from './graph.ts';
import { lic, licDirection } from './lic.ts';

const ctx = (seed = 1): TexContext => ({
  w: 128,
  h: 128,
  metresU: 0.25,
  metresV: 0.25,
  wrapU: true,
  seed,
  tileU: 0.25,
});

/** Mean |a(i) − a(i + offset)|: small = correlated along that offset. */
function drift(a: Float32Array, w: number, dx: number, dy: number): number {
  let s = 0;
  let n = 0;
  for (let y = 4; y < w - 4 - dy; y++)
    for (let x = 4; x < w - 4 - dx; x++) {
      s += Math.abs((a[y * w + x] ?? 0) - (a[(y + dy) * w + x + dx] ?? 0));
      n++;
    }
  return s / n;
}

describe('tex.lic', () => {
  it('rejects length 0 and a negative grain (no flow to smear, NaN cells)', () => {
    expect(() => lic({ length: 0, grain: 0.002 })).toThrow('T3D_MATERIAL_INVALID');
    expect(() => lic({ length: 0.02, grain: -1 })).toThrow('T3D_MATERIAL_INVALID');
  });

  it('streaks run along the flow: neighbours along +U agree more than across', () => {
    const a = lic({ angle: 0, length: 0.02, grain: 0.003 }).eval(ctx());
    expect(drift(a, 128, 3, 0)).toBeLessThan(drift(a, 128, 0, 3) * 0.6);
    const b = lic({ angle: Math.PI / 2, length: 0.02, grain: 0.003 }).eval(ctx());
    expect(drift(b, 128, 0, 3)).toBeLessThan(drift(b, 128, 3, 0) * 0.6);
  });

  it('follows a flow field (angle as a texture node)', () => {
    const vertical = fn(() => Math.PI / 2, 'up');
    const a = lic({ angle: vertical, length: 0.02, grain: 0.003 }).eval(ctx());
    expect(drift(a, 128, 0, 3)).toBeLessThan(drift(a, 128, 3, 0) * 0.6);
  });

  it('stays in 0..1 with real contrast, deterministic per seed, and tiles along U', () => {
    const node = lic({ angle: 0.4, length: 0.015, grain: 0.002 });
    const a = node.eval(ctx(1));
    expect(Math.min(...a)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...a)).toBeLessThanOrEqual(1);
    expect(Math.max(...a) - Math.min(...a)).toBeGreaterThan(0.4);
    expect(lic({ angle: 0.4, length: 0.015, grain: 0.002 }).eval(ctx(1))).toEqual(a);
    expect(node.eval(ctx(2))).not.toEqual(a);
    expect(() =>
      probeGraph(material({ height: node, albedo: node, roughness: 0.6 }), 0.25, 0.1, 'lic'),
    ).not.toThrow();
  });

  it('licDirection: axial angle 0..1 (π and 0 are the same direction)', () => {
    const c = ctx();
    expect(licDirection(Math.PI / 2).eval(c)[0]).toBeCloseTo(0.5, 6);
    expect(licDirection(Math.PI).eval(c)[0]).toBeCloseTo(0, 6);
    const f = new TexField((k) => new Float32Array(k.w * k.h).fill(-Math.PI / 4), 'f');
    expect(licDirection(f).eval(c)[0]).toBeCloseTo(0.75, 6);
  });
});
