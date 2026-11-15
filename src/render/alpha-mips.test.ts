import { expect, it } from 'bun:test';
import type { PaintedSheet } from '../material/index.ts';
import { ALPHA_CUT, alphaCoverage } from './alpha-mips.ts';
import { type Mip, sheetTextures } from './texture.ts';

/** A size² sheet of scattered 1-px dark strands on white at 40% alpha coverage. */
function strands(size: number): PaintedSheet {
  const albedo = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      const on = (x * 7 + y * 3) % 5 < 2;
      albedo.fill(on ? 40 : 255, o, o + 3);
      albedo[o + 3] = on ? 255 : 0;
    }
  const flat = new Uint8Array(size * size * 4).fill(255);
  return { size, albedo, normal: flat, orm: flat };
}

const mean = (m: Mip, c: number): number => {
  let s = 0;
  for (let i = c; i < m.data.length; i += 4) s += m.data[i] ?? 0;
  return s / (m.size * m.size);
};

it('keeps 1-px strands alive in every mip: alpha-test coverage within ±5% of mip 0', () => {
  const t = sheetTextures(strands(64));
  const top = t.albedo[0];
  if (!top) throw new Error('no mip 0');
  expect(alphaCoverage(top)).toBeCloseTo(0.4, 2);
  // Plain box averaging leaves mip 3 at ~0.4 alpha everywhere: ~0% of texels pass the cut.
  const m3 = t.albedo[3];
  if (!m3) throw new Error('no mip 3');
  expect(alphaCoverage(m3)).toBeGreaterThan(0.35);
  for (const m of t.albedo.slice(1)) {
    expect(Math.abs(alphaCoverage(m) - alphaCoverage(top))).toBeLessThanOrEqual(0.05);
    for (let i = 3; i < m.data.length; i += 4) {
      expect(m.data[i] ?? -1).toBeGreaterThanOrEqual(0);
      expect(m.data[i] ?? 2).toBeLessThanOrEqual(1);
    }
  }
});

it('averages strand colour by alpha, so empty texels do not bleach the strands', () => {
  const t = sheetTextures(strands(64));
  const m3 = t.albedo[3];
  if (!m3) throw new Error('no mip 3');
  // Strands are sRGB 40 (linear ≈ 0.021); a plain average with the white gaps would be ≈ 0.61.
  expect(mean(m3, 0)).toBeLessThan(0.05);
});

it('leaves an opaque sheet and every non-albedo chain untouched by the cutout fix', () => {
  const size = 32;
  const albedo = new Uint8Array(size * size * 4);
  for (let i = 0; i < albedo.length; i++) albedo[i] = i % 4 === 3 ? 255 : (i * 37) % 256;
  const flat = new Uint8Array(size * size * 4).fill(200);
  const t = sheetTextures({ size, albedo, normal: flat, orm: flat });
  for (const m of t.albedo) for (let i = 3; i < m.data.length; i += 4) expect(m.data[i]).toBe(1);
  const m1 = t.albedo[1];
  const top = t.albedo[0];
  if (!m1 || !top) throw new Error('no mips');
  const box =
    ((top.data[0] ?? 0) + (top.data[4] ?? 0) + (top.data[128] ?? 0) + (top.data[132] ?? 0)) * 0.25;
  expect(m1.data[0]).toBe(Math.fround(box));
  expect(ALPHA_CUT).toBe(0.5);
});
