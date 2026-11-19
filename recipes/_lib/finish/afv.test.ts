// Graded field dirt: mud falls off with height and never reaches the plates above its band, dust
// stays off walls, a tyre stays darker than the muddy dish beside it. Failure first: the old
// all-over layer (the same weight at every height) is refused by the same check.

import { describe, expect, it } from 'bun:test';
import { box, cylinder, hex, lathe, type Mesh, merge, type Vec3 } from '@developerz.ai/ts23d';
import { dishMud, dustAt, fieldGrade, meanDishMud, mudAt, wheelDirt } from './afv.ts';

const PAINT: Vec3 = hex('#4e5a2c');
const EARTH: Vec3 = hex('#8f7a5a');
const half = (): number => 0.5;

/** Mean distance of the colours from `c` over vertices that pass `pick`. */
const off = (m: Mesh, c: Vec3, pick: (p: Vec3, n: Vec3) => boolean): number => {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < m.positions.length / 3; i++) {
    const at = (a: Float32Array): Vec3 => [a[i * 3] ?? 0, a[i * 3 + 1] ?? 0, a[i * 3 + 2] ?? 0];
    if (!pick(at(m.positions), at(m.normals))) continue;
    sum += Math.hypot(...at(m.colors).map((v, k) => v - (c[k] ?? 0)));
    n++;
  }
  return n ? sum / n : Number.NaN;
};

/** Dirt that fades with height: more at the foot than at the head, nothing above the band. */
const graded = (w: (z: number) => number): boolean => w(0.1) > w(0.6) && w(1.3) === 0;

describe('fieldGrade', () => {
  it('refuses an all-over layer: the same weight at every height is not graded', () => {
    expect(graded(() => 0.5)).toBe(false);
    expect(graded((z) => mudAt(z, 1.2))).toBe(true);
  });

  it('mud covers the foot of a wall and leaves its head in paint', () => {
    const wall = box({ size: [1, 0.1, 2], color: PAINT });
    const out = fieldGrade(half, half, { earth: EARTH, wet: EARTH, dust: EARTH })(wall, {
      mud: 1.0,
    });
    expect(off(out, PAINT, (p) => p[2] > 1.5)).toBeLessThan(1e-6);
    expect(off(out, PAINT, (p) => p[2] < 0.1)).toBeGreaterThan(0.2);
  });

  it('dust settles on the top face only', () => {
    expect(dustAt(0)).toBe(0);
    expect(dustAt(0.64)).toBe(0);
    expect(dustAt(1)).toBe(1);
    const slab = box({ size: [1, 1, 1], color: PAINT });
    const out = fieldGrade(half, half, { earth: EARTH, wet: EARTH, dust: EARTH })(slab, {
      dust: 0.5,
    });
    expect(off(out, PAINT, (_, n) => Math.abs(n[2]) < 0.5)).toBeLessThan(1e-6);
    expect(off(out, PAINT, (_, n) => n[2] > 0.9)).toBeGreaterThan(0.05);
  });
});

describe('wheelDirt', () => {
  const RUBBER: Vec3 = hex('#2e2d2a');
  const wheel = merge([
    lathe({
      profile: [
        [0.33, -0.05],
        [0.4, -0.05],
        [0.4, 0.05],
        [0.33, 0.05],
      ],
      segments: 12,
      axis: 'y',
      color: RUBBER,
    }),
    cylinder({ radius: 0.33, length: 0.12, segments: 12, axis: 'y', color: PAINT }),
  ]);
  const o = { r: 0.4, tyre: RUBBER, earth: EARTH, noise: half };

  it('keeps the hub in paint and packs the outer dish', () => {
    expect(dishMud(0.2)).toBe(0);
    expect(dishMud(0.8)).toBe(1);
    const out = wheelDirt(wheel, o);
    expect(off(out, PAINT, (p) => Math.hypot(p[0], p[2]) < 0.05)).toBeLessThan(1e-6);
  });

  it('leaves the tyre darker than the muddy dish beside it', () => {
    const out = wheelDirt(wheel, o);
    const lum = (pick: (p: Vec3) => boolean): number => {
      let sum = 0;
      let n = 0;
      for (let i = 0; i < out.positions.length / 3; i++) {
        const p: Vec3 = [out.positions[i * 3] ?? 0, 0, out.positions[i * 3 + 2] ?? 0];
        if (!pick(p)) continue;
        sum +=
          (out.colors[i * 3] ?? 0) + (out.colors[i * 3 + 1] ?? 0) + (out.colors[i * 3 + 2] ?? 0);
        n++;
      }
      return sum / n;
    };
    const rim = (p: Vec3): number => Math.hypot(p[0], p[2]);
    expect(lum((p) => rim(p) > 0.39)).toBeLessThan(0.6 * lum((p) => rim(p) > 0.3 && rim(p) < 0.35));
  });

  it('a far disc takes the near dish’s mean mud as one flat block', () => {
    const k = meanDishMud(0.83);
    expect(k).toBeGreaterThan(0.2);
    expect(k).toBeLessThan(0.6);
    const out = wheelDirt(wheel, { ...o, flat: k });
    const disc: number[] = [];
    for (let i = 0; i < out.positions.length / 3; i++)
      if (Math.abs((wheel.colors[i * 3] ?? 0) - PAINT[0]) < 1e-4) disc.push(out.colors[i * 3] ?? 0);
    expect(Math.max(...disc) - Math.min(...disc)).toBeLessThan(1e-6);
  });
});
