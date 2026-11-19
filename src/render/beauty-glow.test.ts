// Emission and see-through shells in the beauty renders (D302, D303): a `glow` part emits in the
// raster and the path-traced hero as it does in the GLB, its light shows through a translucent or
// glass shell tinted by that shell, and a see-through shell does not shadow what it holds.

import { describe, expect, it } from 'bun:test';
import { type CompiledAsset, compile, defineAsset } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { renderBeauty } from './beauty.ts';
import { fromSrgb } from './lighting.ts';
import { renderPath } from './path/path-hero.ts';

const AMBER = [1, 0.6, 0.2] as const;
/** A 0.4 m amber core, optionally glowing, optionally inside a 1 m see-through shell. */
const crystal = (shell: 'translucent' | 'glass' | null, glow: boolean): CompiledAsset =>
  compile(
    defineAsset({
      name: 'crystal',
      kind: 'prop',
      budget: { triangles: [99, 99, 99] },
      ...(glow ? { glow: [{ parts: ['core'], color: AMBER, strength: 4 }] } : {}),
      build: (ctx) => {
        ctx.part('core', box({ size: [0.4, 0.4, 0.4], at: [0, 0, 0.5], color: [0.5, 0.3, 0.1] }));
        if (shell)
          ctx.part('shell', box({ size: [1, 1, 1], at: [0, 0, 0.5], color: [0.8, 0.9, 1] }), {
            parent: 'core',
            surface: shell,
          });
      },
    }),
  );

// Framed on the shelled asset so the core lands on the same pixels with and without its shell.
const frameFrom = crystal('glass', false);
const o = { width: 96, height: 54, frameFrom };
/** Linear red at the image centre (the core's near corner), mean of 3 × 3 pixels. */
const red = (r: { rgba: Uint8Array; width: number; height: number }): number => {
  let s = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      s += fromSrgb((r.rgba[((r.height / 2 + dy) * r.width + r.width / 2 + dx) * 4] ?? 0) / 255);
  return s / 9;
};

describe('glow in the raster beauty render', () => {
  const dark = red(renderBeauty(crystal(null, false), o));

  it('a glowing part is brighter than the same part lit by the studio alone', () => {
    expect(red(renderBeauty(crystal(null, true), o))).toBeGreaterThan(dark + 0.3);
  });

  it('the glow shows through a translucent shell, dimmer than bare', () => {
    const bare = red(renderBeauty(crystal(null, true), o));
    const inside = red(renderBeauty(crystal('translucent', true), o));
    const unlit = red(renderBeauty(crystal('translucent', false), o));
    expect(inside).toBeGreaterThan(unlit + 0.1);
    expect(inside).toBeLessThan(bare);
  });

  it('a glass shell does not put its contents in shadow', () => {
    // Seen from above: the core's sunlit top through the shell's top pane.
    const top = { ...o, elDeg: 75 };
    const open = red(renderBeauty(crystal(null, false), top));
    const shelled = red(renderBeauty(crystal('glass', false), top));
    // The pane tints what shows through (0.8 red) and dims the sun by its two faces (0.85); a
    // core in the shell's opaque shadow, as it was drawn before, shows 0.24 of the open one.
    expect(shelled).toBeGreaterThan(0.55 * open);
    expect(shelled).toBeLessThan(open);
  });
});

describe('glow in the path-traced hero', () => {
  const p = { ...o, spp: 16, denoise: false };

  it('emits, bare and through a shell', () => {
    const dark = red(renderPath(crystal(null, false), p));
    const bare = red(renderPath(crystal(null, true), p));
    expect(bare).toBeGreaterThan(dark + 0.3);
    const unlit = red(renderPath(crystal('glass', false), p));
    const inside = red(renderPath(crystal('glass', true), p));
    expect(inside).toBeGreaterThan(unlit + 0.1);
    expect(inside).toBeLessThanOrEqual(bare + 0.02);
  });

  it('lights what stands next to it', () => {
    // A grey wall beside the core, on its shadow side: brighter when the core glows.
    const scene = (glow: boolean): CompiledAsset =>
      compile(
        defineAsset({
          name: 'lamp',
          kind: 'prop',
          budget: { triangles: [99, 99, 99] },
          ...(glow ? { glow: [{ parts: ['core'], color: [1, 1, 1], strength: 8 }] } : {}),
          build: (ctx) => {
            ctx.part(
              'core',
              box({ size: [0.6, 0.6, 0.6], at: [0, 0.6, 0.3], color: [0.5, 0.5, 0.5] }),
            );
            ctx.part(
              'wall',
              box({ size: [1.2, 0.1, 1.2], at: [0, 0, 0.6], color: [0.5, 0.5, 0.5] }),
              {
                parent: 'core',
              },
            );
          },
        }),
      );
    const sum = (a: CompiledAsset): number =>
      renderPath(a, { width: 48, height: 48, spp: 32, azDeg: 90, elDeg: 5 }).linear.reduce(
        (s, v) => s + v,
        0,
      );
    expect(sum(scene(true))).toBeGreaterThan(sum(scene(false)) * 1.05);
  });
});
