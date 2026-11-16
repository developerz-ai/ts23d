// The à-trous denoise: it must actually remove noise on a flat region, and must not smear across
// an albedo edge or a normal crease (the guides are what make it safe on texture and silhouettes).

import { describe, expect, it } from 'bun:test';
import { denoise } from './denoise.ts';

const W = 32;
const H = 16;

function image(noise: number): { color: Float32Array; albedo: Float32Array; normal: Float32Array } {
  const color = new Float32Array(W * H * 3);
  const albedo = new Float32Array(W * H * 3);
  const normal = new Float32Array(W * H * 3);
  let s = 7;
  for (let i = 0; i < W * H; i++) {
    const left = i % W < W / 2;
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const n = 1 + noise * (s / 4294967296 - 0.5);
    for (let k = 0; k < 3; k++) {
      albedo[i * 3 + k] = left ? 0.2 : 0.8;
      color[i * 3 + k] = (left ? 0.2 : 0.8) * 0.5 * n;
    }
    normal[i * 3 + 2] = 1;
  }
  return { color, albedo, normal };
}

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

describe('denoise', () => {
  it('leaves a noisy image noisy with zero passes (the check can fail)', () => {
    const img = image(0.8);
    const out = denoise({ width: W, height: H, ...img }, { passes: 0 });
    expect(spread(out, W / 2 + 2, W - 2)).toBeGreaterThan(0.2);
  });

  it('flattens noise inside a flat region', () => {
    const img = image(0.8);
    const before = spread(img.color, W / 2 + 2, W - 2);
    const out = denoise({ width: W, height: H, ...img });
    expect(spread(out, W / 2 + 2, W - 2)).toBeLessThan(before * 0.3);
  });

  it('keeps an albedo edge sharp', () => {
    const img = image(0);
    const out = denoise({ width: W, height: H, ...img });
    const row = 8 * W;
    expect(out[(row + W / 2 - 1) * 3]).toBeCloseTo(0.1, 3);
    expect(out[(row + W / 2) * 3]).toBeCloseTo(0.4, 3);
  });

  it('keeps a normal crease sharp', () => {
    const img = image(0);
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
});
