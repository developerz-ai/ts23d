import { describe, expect, it } from 'bun:test';
import type { Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import type { Field } from '../primitives/index.ts';
import { painted, streak } from './creature-tone.ts';

const GREY: Vec3 = [0.4, 0.4, 0.4];
const grey = (): Vec3 => GREY;
/** Box SDF, half-extents h, centred at c. */
const slab =
  (h: Vec3, c: Vec3 = [0, 0, 0]): Field =>
  (p) => {
    const q = [0, 1, 2].map((k) => Math.abs((p[k] ?? 0) - (c[k] ?? 0)) - (h[k] ?? 0));
    const o = dmath.norm(q.map((v) => Math.max(v, 0)));
    return o + Math.min(Math.max(q[0] ?? 0, q[1] ?? 0, q[2] ?? 0), 0);
  };
const warmth = (c: Vec3): number => c[0] / Math.max(1e-6, c[2]);
const lum = (c: Vec3): number => (c[0] + c[1] + c[2]) / 3;

describe('painted (field-measured tone)', () => {
  it('rejects reach 0: the curvature probe would divide by zero', () => {
    expect(() => painted(slab([1, 1, 1]), grey, { reach: 0 })).toThrow('T3D_BAKE_INVALID');
  });

  it('a thin plate (4 mm) glows warm; a thick block (20 cm) does not', () => {
    const o = { reach: 0.02, strands: 0 };
    const thin = painted(slab([0.2, 0.2, 0.002]), grey, o)([0.0, 0.0, 0.002]);
    const thick = painted(slab([0.2, 0.2, 0.1]), grey, o)([0.0, 0.0, 0.1]);
    expect(warmth(thin)).toBeGreaterThan(warmth(thick) * 1.3);
    // Black pigment barely glows (nose leather, lid rims).
    const black = painted(
      slab([0.2, 0.2, 0.002]),
      (): Vec3 => [0.002, 0.002, 0.002],
      o,
    )([0, 0, 0.002]);
    expect(black[0]).toBeLessThan(0.05);
  });

  it('a fold is darker than open flat skin', () => {
    // Two blocks meeting at a 2 cm-wide slot: the slot floor is a crease.
    const a = slab([0.2, 0.2, 0.1], [0, -0.21, 0]);
    const b = slab([0.2, 0.2, 0.1], [0, 0.21, 0]);
    const floor = slab([0.2, 0.4, 0.05], [0, 0, -0.05]);
    const field: Field = (p) => Math.min(a(p), b(p), floor(p));
    const tone = painted(field, grey, { reach: 0.04, strands: 0 });
    const crease = tone([0, 0, 0.0]);
    const top = tone([0, 0.25, 0.1]);
    expect(lum(crease)).toBeLessThan(lum(top) * 0.85);
  });

  it('dirt pools near the ground: the same side face is browner low than high', () => {
    const post = slab([0.05, 0.05, 0.5], [0, 0, 0.5]);
    const tone = painted(post, grey, { reach: 0.02, ground: 0.4, strands: 0, thin: 0 });
    const low = tone([0.05, 0, 0.02]);
    const high = tone([0.05, 0, 0.9]);
    expect(warmth(low)).toBeGreaterThan(warmth(high) * 1.05);
    expect(lum(low)).toBeLessThan(lum(high));
  });

  it('strands: off → a flat face is uniform; on → it varies', () => {
    const face = slab([1, 1, 0.5]);
    const pts: Vec3[] = Array.from({ length: 40 }, (_, i) => [i * 0.013 - 0.25, i * 0.007, 0.5]);
    const off = painted(face, grey, { reach: 0.02, strands: 0, thin: 0 });
    const on = painted(face, grey, { reach: 0.02, strands: 0.12, thin: 0 });
    const spread = (f: (q: Vec3) => Vec3): number => {
      const l = pts.map((p) => lum(f(p)));
      return Math.max(...l) - Math.min(...l);
    };
    expect(spread(off)).toBeLessThan(1e-9);
    expect(spread(on)).toBeGreaterThan(0.03);
  });
});

describe('streak (line-integral convolution along the hair)', () => {
  it('neighbours along the lie agree more than neighbours across it', () => {
    let along = 0;
    let across = 0;
    for (let i = 0; i < 400; i++) {
      const p: Vec3 = [(i % 20) * 0.031, Math.floor(i / 20) * 0.029, 0.3];
      const s = streak(p, [1, 0, 0]);
      along += Math.abs(s - streak([p[0] + 0.012, p[1], p[2]], [1, 0, 0]));
      across += Math.abs(s - streak([p[0], p[1] + 0.012, p[2]], [1, 0, 0]));
    }
    expect(along).toBeLessThan(across * 0.6);
  });
});
