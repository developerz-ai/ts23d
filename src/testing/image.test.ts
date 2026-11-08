import { describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile, defineAsset, encodePng, Ts23dError, type Vec3 } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { silhouette } from '../render/index.ts';
import {
  AXIS_VIEWS,
  assertNoHoles,
  assertNotEmpty,
  assertSilhouetteMatches,
  decodeImage,
  expectImageClose,
  type Image,
} from './index.ts';

const grey: Vec3 = [0.5, 0.5, 0.5];

const run = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return e instanceof Ts23dError ? `${e.code} ${e.message} fix: ${e.fix}` : `non-ts23d ${e}`;
  }
  return 'passed';
};

const solid = (w: number, h: number, rgb: Vec3): Image => {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...rgb, 255], i * 4);
  return { width: w, height: h, data };
};

/** An L: a long low block plus a tower at its +X end — asymmetric from the side. */
const ell = defineAsset({
  name: 'ell',
  kind: 'prop',
  budget: { triangles: [99, 99, 99] },
  build: (ctx) => {
    ctx.part('base', box({ size: [4, 1, 1], color: grey }));
    ctx.part('tower', box({ size: [1, 1, 2], at: [1.5, 0, 1], color: grey }));
  },
});

const plain = defineAsset({
  name: 'plain',
  kind: 'prop',
  budget: { triangles: [99, 99, 99] },
  build: (ctx) => {
    ctx.part('base', box({ size: [4, 1, 3], color: grey }));
  },
});

/** A square tube along X from four 10 cm slabs (or one solid block): open, you see straight
 *  through it from ±X. */
const tube = (open: boolean) =>
  defineAsset({
    name: 'tube',
    kind: 'prop',
    budget: { triangles: [99, 99, 99] },
    build: (ctx) => {
      if (!open) {
        ctx.part('block', box({ size: [2, 1, 1], color: grey }));
        return;
      }
      ctx.part('floor', box({ size: [2, 1, 0.1], color: grey }));
      ctx.part('roof', box({ size: [2, 1, 0.1], at: [0, 0, 0.9], color: grey }));
      ctx.part('wall_l', box({ size: [2, 0.1, 0.8], at: [0, 0.45, 0.1], color: grey }));
      ctx.part('wall_r', box({ size: [2, 0.1, 0.8], at: [0, -0.45, 0.1], color: grey }));
    },
  });

/** A mask PNG of `asset` seen along `view` (black asset on white), as a photo tracer would draw. */
const maskPng = (asset: typeof ell, view: keyof typeof AXIS_VIEWS): Uint8Array => {
  const s = silhouette(compile(asset), AXIS_VIEWS[view], 200);
  const rgba = new Uint8Array(s.size * s.size * 4);
  for (let i = 0; i < s.mask.length; i++) {
    const v = s.mask[i] ? 0 : 255;
    rgba.set([v, v, v, 255], i * 4);
  }
  return encodePng(s.size, s.size, rgba);
};

describe('image assertions — failure cases first', () => {
  it('assertNotEmpty fails on a blank render and an empty region', () => {
    expect(run(() => assertNotEmpty(solid(64, 64, [20, 20, 20])))).toContain('0.00% drawn');
    const half = solid(64, 64, [20, 20, 20]);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 32; x++) half.data.set([200, 0, 0], (y * 64 + x) * 4);
    expect(
      run(() =>
        assertNotEmpty(half, { x: 40, y: 0, width: 24, height: 64 }, { background: [20, 20, 20] }),
      ),
    ).toContain('region 24×64 at (40, 0)');
  });

  it('expectImageClose fails on a changed image and writes <golden>.diff.png', () => {
    const dir = mkdtempSync(join(tmpdir(), 't3d-golden-'));
    const golden = join(dir, 'a.png');
    expect(expectImageClose(solid(32, 32, [10, 10, 10]), golden)).toBe(0);
    const changed = solid(32, 32, [10, 10, 10]);
    for (let i = 0; i < 100; i++) changed.data.set([250, 250, 250], i * 4);
    const r = run(() => expectImageClose(changed, golden));
    expect(r).toContain('9.77% of pixels differ');
    const diff = decodeImage(new Uint8Array(readFileSync(join(dir, 'a.diff.png'))));
    expect([...diff.data.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect(run(() => expectImageClose(solid(16, 16, [0, 0, 0]), golden))).toContain('golden');
  });

  it('assertSilhouetteMatches fails a different shape, assertNoHoles a see-through tube', () => {
    expect(run(() => assertSilhouetteMatches(plain, '-Y', maskPng(ell, '-Y'), 0.9))).toMatch(
      /outline from -Y matches the reference mask at IoU 0\.\d+ < 0\.9/,
    );
    expect(run(() => assertNoHoles(tube(true)))).toContain('seen from +X');
  });
});

describe('image assertions — passing cases', () => {
  it('a drawn image is not empty; an unchanged image matches its golden', () => {
    const img = solid(32, 32, [20, 20, 20]);
    img.data.set([200, 200, 200], 0);
    for (let i = 1; i < 200; i++) img.data.set([200, 200, 200], i * 4);
    expect(assertNotEmpty(img, undefined, { background: [20, 20, 20] })).toBeGreaterThan(0.15);
    const dir = mkdtempSync(join(tmpdir(), 't3d-golden-'));
    expectImageClose(img, join(dir, 'b.png'));
    expect(expectImageClose(img, join(dir, 'b.png'))).toBe(0);
    expect(existsSync(join(dir, 'b.diff.png'))).toBe(false);
  });

  it('the same shape matches its own mask, even framed differently; a closed box has no holes', () => {
    expect(assertSilhouetteMatches(ell, '-Y', maskPng(ell, '-Y'), 0.9)).toBeGreaterThan(0.97);
    expect(assertNoHoles(tube(false))).toBe(0);
  });
});
