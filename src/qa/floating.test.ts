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

/** Parts by name on the ground plane's asset. */
const built = (parts: readonly (readonly [string, Vec3, Vec3])[]): CompiledAsset =>
  compile(
    defineAsset({
      name: 'yard',
      kind: 'prop',
      budget: { triangles: [999, 999, 999] },
      build(ctx) {
        for (const [name, size, at] of parts) ctx.part(name, box({ size, color: c }), { at });
      },
    }),
  );

describe('floating-parts: contact the sparse samples miss', () => {
  it('still fails a post hovering 3 cm over its base, with the true gap', () => {
    const [f] = floatingParts(
      built([
        ['base', [1, 1, 0.5], [0, 0, 0]],
        ['post', [0.1, 0.1, 0.3], [0.2, 0.1, 0.53]],
      ]),
    );
    expect(f?.part).toBe('post');
    expect(f?.gap ?? 0).toBeCloseTo(0.03, 3);
  });

  it('holds a post sunk 3, 5 and 15 cm into its base (no sample is within 2 cm of the skin)', () => {
    for (const sink of [0.03, 0.05, 0.15])
      expect(
        floatingParts(
          built([
            ['base', [1, 1, 0.5], [0, 0, 0]],
            ['post', [0.1, 0.1, 0.3], [0.2, 0.1, 0.5 - sink]],
          ]),
        ),
      ).toEqual([]);
  });

  it('holds a 3 m rail passing through two 4 cm posts, wherever it crosses them', () => {
    for (const z of [0.37, 0.48, 0.61])
      expect(
        floatingParts(
          built([
            ['post_a', [0.04, 0.04, 1], [-1, 0, 0]],
            ['post_b', [0.04, 0.04, 1], [1, 0, 0]],
            ['rail', [3, 0.04, 0.04], [0, 0, z]],
          ]),
        ),
      ).toEqual([]);
  });

  it('reports the true gap of a rail that misses its posts by 3 cm', () => {
    const [f, ...rest] = floatingParts(
      built([
        ['post_a', [0.04, 0.04, 1], [-1, 0, 0]],
        ['post_b', [0.04, 0.04, 1], [1, 0, 0]],
        ['rail', [3, 0.04, 0.04], [0, 0.07, 0.37]],
      ]),
    );
    expect(rest).toEqual([]);
    expect(f?.part).toBe('rail');
    expect(f?.gap ?? 0).toBeCloseTo(0.03, 3);
  });

  it('still fails a part hanging inside a closed part, clear of its walls: it crosses nothing', () => {
    const found = floatingParts(
      built([
        ['tank', [1, 1, 1], [0, 0, 0]],
        ['bubble', [0.1, 0.1, 0.1], [0, 0, 0.45]],
      ]),
    );
    expect(found.map((f) => f.part)).toEqual(['bubble']);
  });
});

describe('floating-parts: fix text an agent can follow', () => {
  it('states each primitive anchor as 02-dsl.md does (a cylinder is centred, not base-anchored)', () => {
    const [f] = floatingParts(built([['crate', [1, 1, 1], [0, 0, 0.5]]]));
    expect(f?.fix).toContain('`box`: `at.z` is the bottom');
    expect(f?.fix).toContain('`cylinder`: centred on `at`');
    expect(f?.fix).not.toContain('box and cylinder anchor at their base');
  });

  it('names the root of a floating chain first and tells its children to move with it', () => {
    const found = floatingParts(
      built([
        ['lamp', [0.2, 0.2, 0.2], [0, 0, 1.45]],
        ['arm', [0.5, 0.05, 0.05], [0.25, 0, 1.4]],
        ['pole', [0.1, 0.1, 1.2], [0, 0, 0.25]],
        ['base', [0.6, 0.6, 0.1], [0, 0, 0.15]],
      ]),
    );
    expect(found.map((f) => f.part)).toEqual(['base', 'pole', 'lamp', 'arm']);
    const [root, pole, lamp, arm] = found;
    expect(root?.fix).toContain('move it 15.0 cm onto the ground');
    expect(pole?.message).toContain("touches 'base', which is itself floating");
    expect(pole?.fix).toContain("fix 'base' first");
    // Each part here is placed on its own: lowering only the base leaves the pole 15 cm above it.
    expect(pole?.fix).not.toContain('do not move');
    expect(pole?.fix).toContain("move 'pole' by the same distance and direction as 'base'");
    expect(pole?.fix).toContain('ctx.group');
    expect(root?.fix).toContain('move the 3 part(s) that hang from it by the same distance');
    expect(pole?.gap).toBeUndefined();
    expect(lamp?.message).toContain("touches 'pole', which is itself floating");
    expect(arm?.fix).toContain("fix 'base' first");
  });
});

describe('floating-parts: following the chain fix', () => {
  const lamp = (drop: number, all: boolean): CompiledAsset =>
    built([
      ['pole', [0.1, 0.1, 1.2], [0, 0, all ? 0.25 - drop : 0.25]],
      ['base', [0.6, 0.6, 0.1], [0, 0, 0.15 - drop]],
    ]);

  it('moving only the root leaves its member floating; moving the assembly together passes', () => {
    expect(floatingParts(lamp(0, true)).map((f) => f.part)).toEqual(['base', 'pole']);
    expect(floatingParts(lamp(0.15, false)).map((f) => f.part)).toEqual(['pole']);
    expect(floatingParts(lamp(0.15, true))).toEqual([]);
  });
});
