// floating-parts: a water asset is held by its largest body, not the ground.

import { describe, expect, it } from 'bun:test';
import { type CompiledAsset, compile, defineAsset, type Vec3 } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { floatingParts } from './floating.ts';

const c: Vec3 = [0.5, 0.5, 0.5];

/** A big body high above z = 0, a fin on it, and `stray` where the test puts it. */
function fish(medium: 'water' | 'ground' | undefined, stray: Vec3): CompiledAsset {
  return compile(
    defineAsset({
      name: 'fish',
      kind: 'prop',
      ...(medium ? { medium } : {}),
      budget: { triangles: [999, 999, 999] },
      build(ctx) {
        ctx.part('stray', box({ size: [0.1, 0.1, 0.1], color: c }), { at: stray });
        ctx.part('body', box({ size: [2, 0.5, 0.5], color: c }), { at: [0, 0, 3] });
        ctx.part('fin', box({ size: [0.2, 0.1, 0.3], color: c }), { at: [0, 0, 3.5] });
      },
    }),
  );
}

describe('floating-parts in water', () => {
  it('fails a part detached from the main body, naming the body', () => {
    const [f, ...rest] = floatingParts(fish('water', [0, 2, 3]));
    expect(rest).toEqual([]);
    expect(f?.part).toBe('stray');
    expect(f?.nearest).toBe('body');
    expect(f?.gap ?? 0).toBeCloseTo(1.7, 1);
    expect(f?.message).toContain('the main body');
    expect(f?.fix).toContain("onto 'body'");
  });

  it('holds the largest body even when a small part is the only one near z = 0', () => {
    const [f, ...rest] = floatingParts(fish('water', [0, 0, 0]));
    expect(rest).toEqual([]);
    expect(f?.part).toBe('stray');
  });

  it('passes a whole swimmer far above the ground, and one below z = 0 (nothing is sunk)', () => {
    expect(floatingParts(fish('water', [0, 0, 3.8]))).toEqual([]);
    const deep = compile(
      defineAsset({
        name: 'deep',
        kind: 'prop',
        medium: 'water',
        budget: { triangles: [99, 99, 99] },
        build(ctx) {
          ctx.part('body', box({ size: [1, 1, 1], color: c }), { at: [0, 0, -9] });
        },
      }),
    );
    expect(floatingParts(deep)).toEqual([]);
  });

  it('keeps the ground rule for every other asset, with or without a declared medium', () => {
    for (const medium of [undefined, 'ground'] as const) {
      const f = floatingParts(fish(medium, [0, 0, 0]));
      expect(f.map((x) => x.part)).toEqual(['body', 'fin']);
      expect(f[0]?.message).toContain('anything attached to the ground');
    }
  });
});
