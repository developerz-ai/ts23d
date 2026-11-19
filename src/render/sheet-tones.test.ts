import { describe, expect, it } from 'bun:test';
import { type CompiledAsset, compile, defineAsset, type Vec3 } from '../core/index.ts';
import { DEFAULT_SHEET, decodePng, paintTrimSheet, stripRect } from '../material/index.ts';
import { box } from '../primitives/index.ts';
import { renderBeauty } from './beauty.ts';
import { fromSrgb } from './lighting.ts';
import { contactSheet } from './sheet.ts';
import { previewSheet, sheetTones, toneAt } from './sheet-tones.ts';
import { thumbnail } from './thumbnail.ts';

const sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: 512 });
const CELL = 64;

const asset = (build: Parameters<typeof defineAsset>[0]['build']): CompiledAsset =>
  compile(defineAsset({ name: 'a', kind: 'prop', budget: { triangles: [99, 99, 99] }, build }));

const oakBox = asset((ctx) =>
  ctx.part('wood', box({ size: [1, 1, 1], color: [1, 1, 1], strip: 'oak' })),
);
const plainBox = asset((ctx) => ctx.part('body', box({ size: [1, 1, 1], color: [0.6, 0.2, 0.2] })));
/** A blue pane (2 × 2 m, glass) in front of a smaller red block, seen from +X. */
const glazed = asset((ctx) => {
  ctx.part('block', box({ size: [1, 1, 1], color: [0.8, 0.1, 0.1] }));
  ctx.part('pane', box({ size: [0.1, 2, 2], at: [1, 0, 0], color: [0.2, 0.4, 0.9] }), {
    surface: 'glass',
  });
});

/** sRGB bytes at the centre of cell `i` (3 = TOP, 1 = FRONT +X) of a `CELL`-sized sheet. */
const centre = (png: Uint8Array, i: number): Vec3 => {
  const img = decodePng(png);
  const x = (i % 3) * CELL + CELL / 2;
  const y = 40 + Math.floor(i / 3) * CELL + CELL / 2;
  const o = (y * img.width + x) * 4;
  return [img.data[o] ?? 0, img.data[o + 1] ?? 0, img.data[o + 2] ?? 0];
};
const lin = (byte: number): number => fromSrgb(byte / 255);
const sha = (b: Uint8Array): string => new Bun.CryptoHasher('sha256').update(b).digest('hex');

describe('contact sheet base colour (D297)', () => {
  it('without a sheet a white box on the oak strip is white: the defect the option fixes', () => {
    const [r, g, b] = centre(contactSheet(oakBox, { cell: CELL }), 3);
    expect([g, b]).toEqual([r, r]);
    expect(r).toBeGreaterThan(200);
  });

  it('with the sheet the same box is brown, the chromaticity the hero shows', () => {
    const [r, g, b] = centre(contactSheet(oakBox, { cell: CELL, sheet }), 3);
    expect(r).toBeGreaterThan(g + 15);
    expect(g).toBeGreaterThan(b + 15);
    expect(r).toBeLessThan(225);
    // The hero's base colour: mean linear colour of its covered pixels, as channel ratios (the
    // hero adds a warm sun, a blue sky and a white highlight, so it is brighter and a little
    // less saturated; the hue must agree).
    const hero = renderBeauty(oakBox, { width: 160, height: 90, sheet });
    const sum = [0, 0, 0];
    for (let i = 0; i < hero.mask.length; i++)
      if ((hero.mask[i] ?? 0) > 250)
        for (let k = 0; k < 3; k++) sum[k] = (sum[k] ?? 0) + lin(hero.rgba[i * 4 + k] ?? 0);
    expect(Math.abs(lin(g) / lin(r) - (sum[1] ?? 0) / (sum[0] ?? 1))).toBeLessThan(0.15);
    expect(Math.abs(lin(b) / lin(r) - (sum[2] ?? 0) / (sum[0] ?? 1))).toBeLessThan(0.15);
  });

  it('a strip tone is the mean linear albedo of its rows, the same for every U', () => {
    const rect = stripRect('oak');
    const out = new Float32Array(3);
    toneAt(sheetTones(sheet), 0.1, (rect.v0 + rect.v1) / 2, out);
    const a = [...out];
    toneAt(sheetTones(sheet), 7.9, (rect.v0 + rect.v1) / 2, out);
    expect([...out]).toEqual(a);
    expect(a[0]).toBeGreaterThan((a[2] ?? 0) * 1.5);
    expect(a[0]).toBeLessThan(0.8);
  });

  it('a vertex-coloured part on the plain strip keeps its colour within 12 / 255', () => {
    const old = centre(contactSheet(plainBox, { cell: CELL }), 3);
    const now = centre(contactSheet(plainBox, { cell: CELL, sheet }), 3);
    for (let k = 0; k < 3; k++) expect(Math.abs((now[k] ?? 0) - (old[k] ?? 0))).toBeLessThan(12);
    expect(now).not.toEqual([255, 255, 255]);
  });

  it('draws glass see-through over what is behind it, opaque without a sheet', () => {
    const through = centre(contactSheet(glazed, { cell: CELL, sheet }), 1);
    const opaque = centre(contactSheet(glazed, { cell: CELL }), 1);
    expect(opaque[2]).toBeGreaterThan(opaque[0] * 1.5);
    expect(through[0]).toBeGreaterThan(through[2]);
  });

  it('is deterministic: the same bytes twice, sheet and thumbnail', () => {
    expect(sha(contactSheet(glazed, { cell: CELL, sheet }))).toBe(
      sha(contactSheet(glazed, { cell: CELL, sheet })),
    );
    expect(sha(thumbnail(oakBox, { size: 48, sheet }))).toBe(
      sha(thumbnail(oakBox, { size: 48, sheet })),
    );
  });

  it('keeps the untextured output pixel for pixel when `sheet` is omitted', () => {
    const mixed = compile(
      defineAsset({
        name: 'mixed',
        kind: 'prop',
        budget: { triangles: [100, 100, 100] },
        build: (ctx) => {
          ctx.part('wood', box({ size: [1, 1, 1], color: [1, 1, 1], strip: 'oak' }));
          ctx.part('pane', box({ size: [0.2, 2, 2], color: [0.5, 0.7, 0.9] }), {
            parent: 'wood',
            surface: 'glass',
          });
        },
      }),
    );
    // Hashes of the decoded pixels from the renderer before D297 (vertex colour only).
    expect(sha(decodePng(contactSheet(mixed, { cell: 64 })).data)).toBe(
      '39c35267491b13d33c2b9ea7f3861052586025d5debfb429c6195aa0ce583fe2',
    );
    expect(sha(decodePng(thumbnail(mixed, { size: 48 })).data)).toBe(
      '7d2b943977f5a90cac53896f56102a6c4ce7e2439356bd6983d7498524e738fe',
    );
  });

  it('previewSheet is a 512² sheet painted once for the materials defined now', () => {
    expect(previewSheet().size).toBe(512);
    expect(previewSheet()).toBe(previewSheet());
  });
});
