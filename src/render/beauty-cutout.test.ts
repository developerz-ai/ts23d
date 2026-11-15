import { expect, it } from 'bun:test';
import { compile, defineAsset } from '../core/index.ts';
import type { PaintedSheet } from '../material/index.ts';
import { box } from '../primitives/index.ts';
import { beauty, renderBeauty } from './beauty.ts';

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

const card = (surface: 'opaque' | 'cutout') =>
  compile(
    defineAsset({
      name: 'card',
      kind: 'prop',
      budget: { triangles: [12, 12, 12] },
      build: (ctx) =>
        ctx.part('body', box({ size: [0.02, 2, 2], color: [0.5, 0.5, 0.5] }), { surface }),
    }),
  );
const covered = (mask: Uint8Array): number => mask.reduce((s, m) => s + m, 0) / 255;
const o = { width: 32, height: 32, azDeg: 0, elDeg: 0 };

it('keeps a far strand card from eroding away at its coarse mip', () => {
  const sheet = strands(1024);
  const solid = covered(renderBeauty(card('opaque'), { ...o, sheet }).mask);
  const cut = covered(renderBeauty(card('cutout'), { ...o, sheet }).mask);
  // Front + back faces at 40% each cover 1 − 0.6² ≈ 64% of the card. Plain box mips average the
  // strands to ~0.4 alpha and the card erodes to ~6%.
  expect(cut).toBeGreaterThan(0.45 * solid);
  expect(cut).toBeLessThan(0.85 * solid);
});

it('renders cutouts byte-deterministically, mips rebuilt from scratch each time', () => {
  const a = beauty(card('cutout'), { ...o, sheet: strands(256) });
  const b = beauty(card('cutout'), { ...o, sheet: strands(256) });
  expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
});
