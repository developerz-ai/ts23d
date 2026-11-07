import { expect, it } from 'bun:test';
import { defineAsset } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { detailWindows, reviewPack } from './review.ts';
import { warningsOf } from './review-warnings.ts';

it('picks no close-up when nothing is visible, and two far-apart windows otherwise', () => {
  expect(detailWindows(new Uint32Array(16 * 9))).toEqual([]);
  const d = new Uint32Array(16 * 9);
  d[0] = 50; // top-left corner: clamped into the frame
  d[1] = 40; // too close to the first
  d[8 + 16 * 5] = 30;
  const w = detailWindows(d);
  expect(w).toHaveLength(2);
  expect(w[0]).toEqual({ x: 1 / 6, y: 1 / 6 });
  expect(w[1]?.x).toBeCloseTo(8.5 / 16);
});

it('warns on LOD popping and bad exposure, and stays quiet on a healthy asset', () => {
  const view = (lodIoU: number) => ({
    view: 'SIDE',
    lod0: { coverage: 0.3, bboxFill: 0.8 },
    lod2: { coverage: 0.3, bboxFill: 0.8 },
    lodIoU,
    lodIoUExact: lodIoU,
  });
  const hero = { coverage: 0.3, span: 0.8, mean: 0.5, contrast: 0.2, nearBlack: 0, nearWhite: 0 };
  const bad = warningsOf({
    asset: 'x',
    triangles: [1, 1, 1],
    hero: { ...hero, mean: 0.05, nearBlack: 0.5 },
    views: [view(0.5)],
  }).map((w) => w.code);
  expect(bad).toEqual(['lod-popping', 'too-dark', 'crushed-blacks']);
  expect(warningsOf({ asset: 'x', triangles: [1, 1, 1], hero, views: [view(0.95)] })).toEqual([]);
});

it('builds the full pack: images, prompt and metrics', () => {
  const crate = defineAsset({
    name: 'crate',
    kind: 'prop',
    budget: { triangles: [12, 12, 12] },
    build: (ctx) => ctx.part('body', box({ size: [1, 1, 1], color: [0.5, 0.35, 0.2] })),
  });
  const pack = reviewPack(crate, { width: 96, height: 54, refs: 'recipes/crate/README.md' });
  for (const f of ['hero.png', 'sheet.png', 'detail_1.png', 'lods.png', 'review.md', 'review.json'])
    expect(pack.files.has(f)).toBe(true);
  expect(pack.metrics.views.every((v) => v.lodIoU === 1)).toBe(true);
  const md = String(pack.files.get('review.md'));
  expect(md).toContain('recipes/crate/README.md');
  expect(md).toContain('VERDICT');
});
