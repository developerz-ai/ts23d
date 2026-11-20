// The à-trous denoise: it must actually remove noise on a flat region, must not smear across an
// albedo edge or a normal crease (the guides), and must keep texture and lighting detail that
// stands above the noise: a textured checker under noisy light, and the dark gaps between hair
// cards (lighting detail no guide sees: same albedo, same normal), D470–D471.

import { describe, expect, it } from 'bun:test';
import { denoise } from './denoise.ts';

const W = 32;
const H = 16;

interface Img {
  color: Float32Array;
  albedo: Float32Array;
  normal: Float32Array;
  variance: Float32Array;
}

/**
 * A flat plane facing the camera: albedo `alb(x, y)`, light `light(x, y)` with uniform noise of
 * relative amplitude `noise`, and the variance of that noise (what the film measures).
 */
function plane(
  noise: number,
  alb: (x: number, y: number) => number,
  light: (x: number, y: number) => number = () => 0.5,
): Img {
  const color = new Float32Array(W * H * 3);
  const albedo = new Float32Array(W * H * 3);
  const normal = new Float32Array(W * H * 3);
  const variance = new Float32Array(W * H);
  let s = 7;
  for (let i = 0; i < W * H; i++) {
    const x = i % W;
    const y = Math.floor(i / W);
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const n = 1 + noise * (s / 4294967296 - 0.5);
    const a = alb(x, y);
    const l = light(x, y);
    for (let k = 0; k < 3; k++) {
      albedo[i * 3 + k] = a;
      color[i * 3 + k] = a * l * n;
    }
    variance[i] = (a * l * noise * (a * l * noise)) / 12;
    normal[i * 3 + 2] = 1;
  }
  return { color, albedo, normal, variance };
}

const halves = (noise: number): Img => plane(noise, (x) => (x < W / 2 ? 0.2 : 0.8));

const spread = (c: Float32Array, x0: number, x1: number): number => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let y = 2; y < H - 2; y++)
    for (let x = x0; x < x1; x++) {
      const v = c[(y * W + x) * 3] ?? 0;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  return hi - lo;
};

/** Mean of the pixels where `on(x, y)` minus the mean of the others (interior rows only). */
function contrast(c: Float32Array, on: (x: number, y: number) => boolean): number {
  let a = 0;
  let na = 0;
  let b = 0;
  let nb = 0;
  for (let y = 2; y < H - 2; y++)
    for (let x = 2; x < W - 2; x++) {
      const v = c[(y * W + x) * 3] ?? 0;
      if (on(x, y)) {
        a += v;
        na++;
      } else {
        b += v;
        nb++;
      }
    }
  return a / na - b / nb;
}

/** Standard deviation of the pixels where `on(x, y)` (interior rows only). */
function deviation(c: Float32Array, on: (x: number, y: number) => boolean): number {
  let s = 0;
  let s2 = 0;
  let n = 0;
  for (let y = 2; y < H - 2; y++)
    for (let x = 2; x < W - 2; x++) {
      if (!on(x, y)) continue;
      const v = c[(y * W + x) * 3] ?? 0;
      s += v;
      s2 += v * v;
      n++;
    }
  return Math.sqrt(Math.max(0, s2 / n - (s / n) * (s / n)));
}

describe('denoise', () => {
  it('leaves a noisy image noisy with zero passes (the check can fail)', () => {
    const img = halves(0.8);
    const out = denoise({ width: W, height: H, ...img }, { passes: 0 });
    expect(spread(out, W / 2 + 2, W - 2)).toBeGreaterThan(0.2);
  });

  it('flattens noise inside a flat region', () => {
    const img = halves(0.8);
    const before = spread(img.color, W / 2 + 2, W - 2);
    const out = denoise({ width: W, height: H, ...img });
    expect(spread(out, W / 2 + 2, W - 2)).toBeLessThan(before * 0.3);
    const right = (x: number) => x >= W / 2 + 2;
    expect(deviation(out, right)).toBeLessThan(deviation(img.color, right) * 0.25);
  });

  it('keeps an albedo edge sharp', () => {
    const img = halves(0);
    const out = denoise({ width: W, height: H, ...img });
    const row = 8 * W;
    expect(out[(row + W / 2 - 1) * 3]).toBeCloseTo(0.1, 3);
    expect(out[(row + W / 2) * 3]).toBeCloseTo(0.4, 3);
  });

  it('keeps a normal crease sharp', () => {
    const img = halves(0);
    img.albedo.fill(0.5);
    for (let i = 0; i < W * H; i++) {
      const left = i % W < W / 2;
      img.normal[i * 3] = left ? 1 : 0;
      img.normal[i * 3 + 2] = left ? 0 : 1;
      for (let k = 0; k < 3; k++) img.color[i * 3 + k] = left ? 0.1 : 0.6;
    }
    const out = denoise({ width: W, height: H, ...img });
    expect(out[(8 * W + W / 2 - 1) * 3]).toBeCloseTo(0.1, 3);
  });

  it("keeps a textured checker's contrast under noisy light, and smooths the noise (D471)", () => {
    // Grime on a worn, textured panel: the dark cells are a little darker in albedo and sit in
    // shallow grooves the light reaches less (the ORM occlusion, a normal map's tilt), under 60 %
    // sample noise.
    const dark = (x: number, y: number) => ((x >> 1) + (y >> 1)) % 2 === 0;
    const alb = (x: number, y: number) => (dark(x, y) ? 0.66 : 0.7);
    const light = (x: number, y: number) => (dark(x, y) ? 0.3 : 0.5);
    const img = plane(0.6, alb, light);
    const clean = Math.abs(contrast(plane(0, alb, light).color, dark));
    const out = denoise({ width: W, height: H, ...img });
    // Dark minus light cells is negative: compare magnitudes. The grooves are only ~2.5 noise
    // deviations deep per pixel, so some contrast may go; the old filter kept about half.
    expect(Math.abs(contrast(out, dark))).toBeLessThan(clean * 1.05);
    expect(Math.abs(contrast(out, dark))).toBeGreaterThan(clean * 0.85);
    // Within one cell type the noise drops: less than for a flat plane, since every 2 × 2 cell
    // borders grooves the filter must not mix with (the price of keeping them).
    const light2 = (x: number, y: number) => !dark(x, y);
    expect(deviation(out, light2)).toBeLessThan(deviation(img.color, light2) * 0.65);
  });

  it('keeps lighting detail no guide sees when it stands above the noise (D470)', () => {
    // Two-pixel stripes of shadow on one albedo and normal: the gaps between hair cards, a
    // panel line's occlusion. 4 % noise, so the stripes are 25 noise widths apart.
    const lit = (x: number) => (x >> 1) % 2 === 0;
    const img = plane(
      0.04,
      () => 0.5,
      (x) => (lit(x) ? 1 : 0.3),
    );
    const clean = contrast(
      plane(
        0,
        () => 0.5,
        (x) => (lit(x) ? 1 : 0.3),
      ).color,
      (x) => lit(x),
    );
    const out = denoise({ width: W, height: H, ...img });
    expect(contrast(out, (x) => lit(x))).toBeGreaterThan(clean * 0.9);
  });

  it('keeps a small specular highlight on one albedo (D472)', () => {
    // A 3 × 3 glint (the tip of a nose, a wet eye, a polished bolt head) at 3× the surrounding
    // light under 5 % noise: lighting only, so neither guide protects it.
    const glint = (x: number, y: number) => Math.abs(x - 16) <= 1 && Math.abs(y - 8) <= 1;
    const img = plane(
      0.05,
      () => 0.5,
      (x, y) => (glint(x, y) ? 1.5 : 0.5),
    );
    const out = denoise({ width: W, height: H, ...img });
    expect(out[(8 * W + 16) * 3]).toBeGreaterThan(0.75 * 0.9);
  });

  it('still smooths lighting differences that are within the noise', () => {
    // The same stripes at 1 % contrast under 60 % noise: indistinguishable from noise, so smoothed.
    const lit = (x: number) => (x >> 1) % 2 === 0;
    const img = plane(
      0.6,
      () => 0.5,
      (x) => (lit(x) ? 0.505 : 0.5),
    );
    const before = spread(img.color, 2, W - 2);
    const out = denoise({ width: W, height: H, ...img });
    expect(spread(out, 2, W - 2)).toBeLessThan(before * 0.3);
  });

  it('is deterministic', () => {
    const a = denoise({ width: W, height: H, ...halves(0.8) });
    const b = denoise({ width: W, height: H, ...halves(0.8) });
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);
  });
});
