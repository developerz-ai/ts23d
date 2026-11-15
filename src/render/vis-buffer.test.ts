import { expect, it } from 'bun:test';
import { footprintMip } from './vis-buffer.ts';

// A long thin card: 100 px × 1 px on screen showing 100 × 16 texels. Its area ratio (16 texels
// per pixel) says mip 2, but along its length it is texel-for-pixel: the alpha detail lives there.
const thin = [100, 0, 0, 1, 100 / 1024, 0, 0, 16 / 1024, 1024] as const;

it('gives a long thin cutout triangle a sharper mip than its area suggests', () => {
  const area = footprintMip(...thin, false);
  const aniso = footprintMip(...thin, true);
  expect(area).toBe(2);
  expect(aniso).toBeLessThan(area);
  expect(aniso).toBe(0);
});

it('caps anisotropy at 16×: a 1 : 1024 sliver is not sampled at mip 0', () => {
  expect(footprintMip(1, 0, 0, 1, 1 / 1024, 0, 0, 1, 1024, true)).toBe(6);
});

it('agrees with the area rule on an isotropic footprint', () => {
  const sq = [10, 0, 0, 10, 40 / 1024, 0, 0, 40 / 1024, 1024] as const;
  expect(footprintMip(...sq, true)).toBe(footprintMip(...sq, false));
  expect(footprintMip(...sq, false)).toBe(2);
});
