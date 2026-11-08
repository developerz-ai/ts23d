import { expect, it, setDefaultTimeout } from 'bun:test';
import { compile, defineAsset, Ts23dError } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { beauty, cameraFor, renderBeauty } from './beauty.ts';
import { project } from './camera.ts';

// The first render paints the default 2048² trim sheet once (~5 s on a loaded machine).
setDefaultTimeout(30_000);

const crate = compile(
  defineAsset({
    name: 'crate',
    kind: 'prop',
    budget: { triangles: [12, 12, 12] },
    build: (ctx) => ctx.part('body', box({ size: [2, 1, 1], color: [0.6, 0.3, 0.2] })),
  }),
);

it('fails on a bad size before rendering anything', () => {
  expect(() => beauty(crate, { width: 4, height: 900 })).toThrow(Ts23dError);
});

it('keeps mid-tones true: a sun-lit #808080 panel stays near 128, not lifted', () => {
  const grey = 0.2158605; // hex('#808080'), linear
  const panel = compile(
    defineAsset({
      name: 'panel',
      kind: 'prop',
      budget: { triangles: [12, 12, 12] },
      build: (ctx) => ctx.part('body', box({ size: [4, 4, 0.05], color: [grey, grey, grey] })),
    }),
  );
  const r = renderBeauty(panel, { width: 160, height: 90, elDeg: 60 });
  const g = r.rgba[(45 * 160 + 80) * 4 + 1] ?? 0;
  expect(g).toBeGreaterThan(112);
  expect(g).toBeLessThan(145);
});

it('is byte-deterministic', () => {
  const o = { width: 96, height: 64 };
  expect(Bun.hash(beauty(crate, o))).toBe(Bun.hash(beauty(crate, o)));
});

it('frames the asset inside the image and shades it off the backdrop', () => {
  const r = renderBeauty(crate, { width: 160, height: 90 });
  const covered = r.mask.reduce((s, v) => s + (v > 127 ? 1 : 0), 0) / r.mask.length;
  expect(covered).toBeGreaterThan(0.1);
  expect(covered).toBeLessThan(0.7);
  const cam = cameraFor(crate, { width: 160, height: 90 });
  for (const [x, y, z] of [
    [-1, -0.5, 0],
    [1, 0.5, 1],
    [1, -0.5, 0],
    [-1, 0.5, 1],
  ] as const) {
    const [sx, sy, w] = project(cam, x, y, z);
    expect(w).toBeGreaterThan(0);
    expect(sx).toBeGreaterThanOrEqual(0);
    expect(sx).toBeLessThanOrEqual(160);
    expect(sy).toBeGreaterThanOrEqual(0);
    expect(sy).toBeLessThanOrEqual(90);
  }
  // The floor carries the crate's shadow: the darkest backdrop pixel is well below the brightest.
  let lo = 255;
  let hi = 0;
  for (let i = 0; i < r.mask.length; i++) {
    if ((r.mask[i] ?? 0) > 0) continue;
    const g = r.rgba[i * 4 + 1] ?? 0;
    lo = Math.min(lo, g);
    hi = Math.max(hi, g);
  }
  expect(lo).toBeLessThan(hi * 0.7);
});
