import { expect, it } from 'bun:test';
import { compile, defineAsset, Ts23dError } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { exposure, maskIoU, maskStats, poolMask, silhouette, viewFrame } from './metrics.ts';
import { VIEWS } from './sheet.ts';

it('refuses to compare masks of different sizes', () => {
  expect(() => maskIoU(new Uint8Array(4), new Uint8Array(9))).toThrow(Ts23dError);
});

it('scores disjoint masks 0, identical 1, half overlap 1/3', () => {
  expect(maskIoU(new Uint8Array([1, 1, 0, 0]), new Uint8Array([0, 0, 1, 1]))).toBe(0);
  expect(maskIoU(new Uint8Array([1, 0, 1, 0]), new Uint8Array([1, 0, 1, 0]))).toBe(1);
  expect(maskIoU(new Uint8Array([1, 1, 0, 0]), new Uint8Array([0, 1, 1, 0]))).toBeCloseTo(1 / 3);
  expect(maskIoU(new Uint8Array(4), new Uint8Array(4))).toBe(1);
});

const slab = (w: number) =>
  compile(
    defineAsset({
      name: 'slab',
      kind: 'prop',
      budget: { triangles: [12, 12, 12] },
      build: (ctx) => ctx.part('body', box({ size: [w, 1, 1], color: [0.5, 0.5, 0.5] })),
    }),
  );

it('sees a shrunken LOD as a lower silhouette IoU in the same frame', () => {
  const view = VIEWS[2] ?? VIEWS[0];
  if (!view) throw new Error('no views');
  const big = slab(2);
  const frame = viewFrame(big, view);
  const a = silhouette(big, view, 128, frame);
  expect(maskIoU(a.mask, silhouette(big, view, 128, frame).mask)).toBe(1);
  const iou = maskIoU(a.mask, silhouette(slab(1), view, 128, frame).mask);
  expect(iou).toBeGreaterThan(0.4);
  expect(iou).toBeLessThan(0.6);
  // A box seen square-on fills its own bounding box.
  expect(maskStats(a).bboxFill).toBeGreaterThan(0.95);
});

it('measures exposure only over masked pixels', () => {
  const rgba = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255, 9, 9, 9, 255]);
  const e = exposure(rgba, new Uint8Array([255, 255, 0]), 3);
  expect(e.coverage).toBeCloseTo(2 / 3);
  expect(e.mean).toBeCloseTo(0.5);
  expect(e.nearBlack).toBeCloseTo(0.5);
  expect(e.nearWhite).toBeCloseTo(0.5);
  expect(e.span).toBe(1); // one row: the full height is spanned
});

it('closes lattice gaps when pooled to the far view', () => {
  // A 4×4 checkerboard vs a solid square: exact IoU ½, pooled 2× → identical.
  const checker = {
    size: 4,
    mask: new Uint8Array(16).map((_, i) => ((i % 4) + Math.floor(i / 4)) % 2),
  };
  const solid = { size: 4, mask: new Uint8Array(16).fill(1) };
  expect(maskIoU(checker.mask, solid.mask)).toBe(0.5);
  expect(maskIoU(poolMask(checker, 2).mask, poolMask(solid, 2).mask)).toBe(1);
});
