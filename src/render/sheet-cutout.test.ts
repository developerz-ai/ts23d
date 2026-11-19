// The contact sheet and the thumbnail alpha-test cutout cards against the trim sheet (D300): a
// leaf or strand card shows its texels' silhouette, never the solid quad that carries them.

import { describe, expect, it } from 'bun:test';
import { type CompiledAsset, compile, defineAsset } from '../core/index.ts';
import { decodePng, type PaintedSheet } from '../material/index.ts';
import { box } from '../primitives/index.ts';
import { contactSheet } from './sheet.ts';
import { thumbnail } from './thumbnail.ts';

/** A size² sheet of scattered 1-px strands at 40% alpha coverage. */
function strands(size: number): PaintedSheet {
  const albedo = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      const on = (x * 7 + y * 3) % 5 < 2;
      albedo.fill(on ? 60 : 250, o, o + 3);
      albedo[o + 3] = on ? 255 : 0;
    }
  const flat = new Uint8Array(size * size * 4).fill(255);
  return { size, albedo, normal: flat, orm: flat };
}

const card = (surface: 'opaque' | 'cutout'): CompiledAsset =>
  compile(
    defineAsset({
      name: 'card',
      kind: 'prop',
      budget: { triangles: [12, 12, 12] },
      build: (ctx) =>
        ctx.part('body', box({ size: [0.02, 2, 2], color: [0.5, 0.5, 0.5] }), { surface }),
    }),
  );

const CELL = 96;
/** Pixels of the FRONT +X panel the asset drew: neither backdrop nor grid line. */
function drawn(png: Uint8Array): number {
  const img = decodePng(png);
  let n = 0;
  for (let y = 40; y < 40 + CELL; y++)
    for (let x = CELL; x < 2 * CELL; x++) {
      const o = (y * img.width + x) * 4;
      const r = img.data[o] ?? 0;
      if (r !== 238 && r !== 190) n++;
    }
  return n;
}
const opaquePixels = (png: Uint8Array): number => {
  const d = decodePng(png).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) n += (d[i] ?? 0) / 255;
  return n;
};
const sha = (b: Uint8Array): string => new Bun.CryptoHasher('sha256').update(b).digest('hex');

describe('contact sheet alpha cutout (D300)', () => {
  const sheet = strands(256);

  it('an opaque card on the same sheet is a solid quad', () => {
    const solid = drawn(contactSheet(card('opaque'), { cell: CELL, sheet }));
    // 2 m of a 2.3 m panel: (96 / 1.15)² ≈ 6970 pixels.
    expect(solid).toBeGreaterThan(6500);
  });

  it('a cutout card covers only its opaque texels', () => {
    const solid = drawn(contactSheet(card('opaque'), { cell: CELL, sheet }));
    const cut = drawn(contactSheet(card('cutout'), { cell: CELL, sheet }));
    // 40% per face; the back face shows through the holes of the front one: 1 − 0.6² ≈ 64%.
    expect(cut).toBeGreaterThan(0.3 * solid);
    expect(cut).toBeLessThan(0.8 * solid);
  });

  it('the thumbnail cuts the same card', () => {
    const solid = opaquePixels(thumbnail(card('opaque'), { size: 64, sheet }));
    const cut = opaquePixels(thumbnail(card('cutout'), { size: 64, sheet }));
    expect(cut).toBeGreaterThan(0.3 * solid);
    expect(cut).toBeLessThan(0.8 * solid);
  });

  it('without a sheet there is no alpha to test: the card stays solid (form-only render)', () => {
    expect(drawn(contactSheet(card('cutout'), { cell: CELL }))).toBe(
      drawn(contactSheet(card('opaque'), { cell: CELL })),
    );
  });

  it('is deterministic', () => {
    const a = contactSheet(card('cutout'), { cell: CELL, sheet });
    expect(sha(contactSheet(card('cutout'), { cell: CELL, sheet }))).toBe(sha(a));
  });
});
