// End to end (D474): the denoised 16-sample hero must land much closer to the converged image than
// the raw 16-sample render, on a box whose normal map carries fine lighting detail (ridges a
// noise-blind filter flattens). The old filter only took a third off the raw error here (and on
// the wolf's fur it ended further from a 256-sample reference than no denoise at all).

import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from '../../core/index.ts';
import type { PaintedSheet } from '../../material/index.ts';
import { box } from '../../primitives/index.ts';
import { renderPath } from './path-hero.ts';

const N = 32;
/** Grey albedo; a normal map of 2-texel ridges tilted ±25° across U: fine relief, one colour. */
const ridged: PaintedSheet = (() => {
  const albedo = new Uint8Array(N * N * 4);
  const normal = new Uint8Array(N * N * 4);
  const orm = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    albedo.set([170, 170, 170, 255], i * 4);
    const up = ((i % N) >> 1) % 2 === 0;
    normal.set([up ? 182 : 74, 128, 243, 255], i * 4);
    orm.set([255, 204, 0, 255], i * 4);
  }
  return { size: N, albedo, normal, orm };
})();

const asset = compile(
  defineAsset({
    name: 'ridged_box',
    kind: 'prop',
    budget: { triangles: [12, 12, 12] },
    build: (ctx) => ctx.part('body', box({ size: [1, 1, 1], color: [1, 1, 1] })),
  }),
);

function lumaError(a: Uint8Array, b: Uint8Array, mask: Uint8Array): number {
  let se = 0;
  let n = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 255) continue;
    for (let k = 0; k < 3; k++) {
      const d = (a[i * 4 + k] ?? 0) - (b[i * 4 + k] ?? 0);
      se += d * d;
    }
    n += 3;
  }
  return Math.sqrt(se / n);
}

describe('denoised hero', () => {
  it('is closer to the converged image than the raw render', () => {
    const o = { width: 48, height: 48, sheet: ridged };
    const ref = renderPath(asset, { ...o, spp: 256, denoise: false });
    const raw = renderPath(asset, { ...o, spp: 16, denoise: false });
    const den = renderPath(asset, { ...o, spp: 16 });
    const eRaw = lumaError(raw.rgba, ref.rgba, ref.mask);
    const eDen = lumaError(den.rgba, ref.rgba, ref.mask);
    expect(eRaw).toBeGreaterThan(0.5);
    expect(eDen).toBeLessThan(eRaw * 0.5);
  });

  it('denoises a 1-sample render too (no per-pixel spread: a spatial estimate stands in)', () => {
    // One sample has no variance to measure: read as zero, every difference above 1 % passed
    // as detail and the noise stayed.
    const o = { width: 48, height: 48, sheet: ridged };
    const ref = renderPath(asset, { ...o, spp: 256, denoise: false });
    const raw = renderPath(asset, { ...o, spp: 1, denoise: false });
    const den = renderPath(asset, { ...o, spp: 1 });
    const eRaw = lumaError(raw.rgba, ref.rgba, ref.mask);
    const eDen = lumaError(den.rgba, ref.rgba, ref.mask);
    expect(eRaw).toBeGreaterThan(2);
    expect(eDen).toBeLessThan(eRaw * 0.5);
  });
});
