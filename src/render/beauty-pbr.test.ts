// The beauty render shades what the GLB declares: a see-through pane shows the bright part behind
// it (an opaque pane of the same colour hides it), clearcoat adds a highlight, and the render
// stays byte-deterministic with the extra "behind" pass.

import { describe, expect, it } from 'bun:test';
import { type AssetDefinition, compile, defineAsset, type Surface } from '../core/index.ts';
import { DEFAULT_SHEET, paintTrimSheet } from '../material/index.ts';
import { box, lathe } from '../primitives/index.ts';
import { renderBeauty } from './beauty.ts';
import { lookOf } from './looks.ts';

const sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: 512 });
const pane = (surface: Surface) =>
  defineAsset({
    name: 'pane',
    kind: 'prop',
    budget: { triangles: [99, 99, 99] },
    build(ctx) {
      ctx.part('back', box({ size: [0.1, 2, 1.4], at: [-0.6, 0, 0], color: [1, 0.9, 0.2] }));
      ctx.part('pane', box({ size: [0.05, 1.2, 0.9], at: [0.3, 0, 0.2], color: [0.9, 0.9, 0.9] }), {
        surface,
      });
    },
  });
const o = { width: 96, height: 64, azDeg: 0, elDeg: 5, sheet } as const;
const centre = (rgba: Uint8Array): number => {
  const i = (32 * 96 + 48) * 4;
  // Yellow shows as red − blue: zero on a neutral pane.
  return (rgba[i] ?? 0) - (rgba[i + 2] ?? 0);
};

describe('beauty: PBR looks', () => {
  it('an opaque pane hides the yellow wall; the same pane as glass shows it', () => {
    const solid = centre(renderBeauty(compile(pane('opaque')), o).rgba);
    const glass = centre(renderBeauty(compile(pane('glass')), o).rgba);
    expect(solid).toBeLessThan(15);
    expect(glass).toBeGreaterThan(solid + 40);
  });

  it('same asset → same bytes with the transmission pass', () => {
    const a = renderBeauty(compile(pane('ice')), o).rgba;
    expect(renderBeauty(compile(pane('ice')), o).rgba).toEqual(a);
  });

  it('looks mirror the GLB: optics overrides, lacquer, finishes', () => {
    const def: AssetDefinition = {
      name: 'l',
      kind: 'prop',
      budget: { triangles: [999, 999, 999] },
      paint: { body: { colour: '#ffffff', clearcoat: 1 } },
      finishes: { fuzz: { sheen: { colour: '#ffffff' } } },
      optics: { glass: { ior: 1.7 } },
      build(ctx) {
        const ball = lathe({
          profile: [
            [0, 0],
            [0.2, 0.2],
            [0, 0.4],
          ],
          segments: 8,
          color: [1, 1, 1],
        });
        ctx.part('a', ball, { paint: 'body' });
        ctx.part('b', ball, { finish: 'fuzz' });
        ctx.part('c', ball, { surface: 'glass' });
        ctx.part('d', ball);
      },
    };
    const c = compile(defineAsset(def));
    const [a, b, g, d] = c.parts.map((p) => lookOf(c, p));
    expect(a?.clearcoat).toBe(1);
    expect(b?.sheen).toEqual([1, 1, 1]);
    expect([g?.ior, g?.transmission]).toEqual([1.7, 1]);
    expect(d?.transmission).toBe(0);
  });
});
