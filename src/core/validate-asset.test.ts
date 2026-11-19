import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from './asset.ts';
import type { AssetDefinition, Measure } from './definition.ts';
import { Ts23dError } from './errors.ts';
import { merge } from './mesh.ts';
import type { Lod, PartOptions } from './part.ts';
import { encodePng } from './png.ts';
import type { TextureSet } from './texture-set.ts';

const budget = { triangles: [10, 10, 10] as const };
const base: AssetDefinition = { name: 'probe', kind: 'prop', budget, build() {} };
const real = { length: 1, width: 1, height: 1 };
const measure: Measure = { label: 'width', value: 1, axis: 'y', parts: ['a'] };

/** `code|fix` of the thrown Ts23dError, 'none' when nothing throws. */
function thrown(f: () => unknown): string {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return `${e.code}|${e.fix}`;
    throw e;
  }
  return 'none';
}
const invalid = /^T3D_RECIPE_INVALID\|.+/;
const define = (over: Partial<AssetDefinition>) => () => defineAsset({ ...base, ...over });

describe('defineAsset validation', () => {
  it('refuses a missing or non-positive budget, and a fractional draws', () => {
    expect(thrown(define({ budget: undefined as never }))).toMatch(invalid);
    expect(thrown(define({ budget: { triangles: [10, 0, 10] } }))).toMatch(invalid);
    expect(thrown(define({ budget: { triangles: [10, 10, 10], draws: 1.5 } }))).toMatch(invalid);
    expect(thrown(define({ budget: { triangles: [10, 10, 10], draws: 3 } }))).toBe('none');
  });

  it('refuses an empty name and a non-integer seed', () => {
    expect(thrown(define({ name: '' }))).toMatch(invalid);
    expect(thrown(define({ seed: 1.7 }))).toMatch(invalid);
    expect(thrown(define({ seed: Number.NaN }))).toMatch(invalid);
  });

  it('refuses a between that is not exactly two parts, and both or neither of parts/between', () => {
    const only = (m: Partial<Measure>) =>
      define({ real: { ...real, measures: [{ label: 'arm', value: 1, axis: 'x', ...m }] } });
    const between = /^T3D_RECIPE_INVALID\|between: \['a', 'b'\] — exactly two parts/;
    expect(thrown(only({ between: ['arm'] as never }))).toMatch(between);
    expect(thrown(only({ between: ['a', 'b', 'c'] as never }))).toMatch(between);
    expect(thrown(only({ between: 'arm' as never }))).toMatch(between);
    expect(thrown(only({ parts: ['a'], between: ['a', 'b'] }))).toMatch(between);
    expect(thrown(only({}))).toMatch(between);
    expect(thrown(only({ between: ['a', 'b'] }))).toBe('none');
    expect(thrown(only({ parts: ['a'] }))).toBe('none');
  });

  it('refuses a measure value of 0 and a tolerance outside (0, 0.5]', () => {
    const withMeasure = (m: Partial<Measure>) =>
      define({ real: { ...real, measures: [{ ...measure, ...m }] } });
    expect(thrown(withMeasure({ value: 0 }))).toMatch(invalid);
    expect(thrown(withMeasure({ tolerance: 5, why: 'loose' }))).toMatch(invalid);
    expect(thrown(withMeasure({ tolerance: 0 }))).toMatch(invalid);
    expect(thrown(withMeasure({ tolerance: Number.NaN }))).toMatch(invalid);
  });

  it('wants a why for a tolerance above the gate default', () => {
    const withMeasure = (m: Partial<Measure>) =>
      define({ real: { ...real, measures: [{ ...measure, ...m }] } });
    expect(thrown(withMeasure({ tolerance: 0.3 }))).toMatch(/^T3D_RECIPE_INVALID\|.*why/);
    expect(thrown(withMeasure({ tolerance: 0.3, why: '  ' }))).toMatch(invalid);
    expect(thrown(withMeasure({ tolerance: 0.3, why: 'hand-built prototype' }))).toBe('none');
    expect(thrown(withMeasure({ tolerance: 0.02 }))).toBe('none');
    expect(thrown(define({ real: { ...real, tolerance: 0.1 } }))).toMatch(invalid);
    expect(thrown(define({ real: { ...real, tolerance: 0.1, why: 'artist mock' } }))).toBe('none');
  });

  it('refuses a non-positive real dimension', () => {
    expect(thrown(define({ real: { ...real, height: 0 } }))).toMatch(invalid);
    expect(thrown(define({ real: { ...real, width: -2 } }))).toMatch(invalid);
  });

  it('refuses a joint tolerance above 0.2 without a why, and above the 0.5 cap', () => {
    const joint = (tolerance: number, why?: string) =>
      compile(
        defineAsset({
          ...base,
          build(ctx) {
            ctx.joint('pin', {
              from: 'a',
              to: 'b',
              at: [0, 0, 0],
              axis: [1, 0, 0],
              tolerance,
              ...(why ? { why } : {}),
            });
          },
        }),
      );
    expect(thrown(() => joint(0.3))).toMatch(invalid);
    expect(thrown(() => joint(0.7, 'very loose'))).toMatch(invalid);
    expect(thrown(() => joint(0.3, 'boss wider than the horn'))).toBe('none');
  });
});

describe('compile validation', () => {
  it('refuses lod 3 and a fractional seed', () => {
    const a = defineAsset(base);
    expect(thrown(() => compile(a, { lod: 3 as Lod }))).toMatch(invalid);
    expect(thrown(() => compile(a, { seed: 1.7 }))).toMatch(invalid);
    expect(thrown(() => compile(a, { lod: 2, seed: 9 }))).toBe('none');
  });

  it('reserves body for the merged root: no group, moving part or use prefix takes it', () => {
    const body = (build: AssetDefinition['build']) => () =>
      compile(defineAsset({ ...base, build }));
    const fix = /^T3D_RECIPE_INVALID\|rename the group; `body` is the merged static root$/;
    expect(thrown(body((ctx) => ctx.group('body')))).toMatch(fix);
    expect(
      thrown(
        body((ctx) =>
          ctx.part('body', null, { motion: { kind: 'spin', axis: [0, 0, 1], rps: 1 } }),
        ),
      ),
    ).toMatch(fix);
    expect(thrown(body((ctx) => ctx.use(defineAsset(base), { prefix: 'body' })))).toMatch(fix);
    // A static meshed part named body merges into the root: allowed (most hulls are one).
    expect(thrown(body((ctx) => ctx.part('body', merge([]))))).toBe('none');
  });
});

/** A real 4×4 PNG whose IHDR claims `size`² (core reads the header only); `salt` varies the bytes. */
function png(size: number, salt = 0): Uint8Array {
  const out = encodePng(4, 4, new Uint8Array(64).fill(salt));
  const dv = new DataView(out.buffer, out.byteOffset);
  dv.setUint32(16, size);
  dv.setUint32(20, size);
  return out;
}

describe('textured parts (ADR 016)', () => {
  const wolf: TextureSet = { name: 'wolf', albedo: png(2048), normal: png(1024, 1) };
  const sets = { count: 1, size: 2048 } as const;
  const textured = (
    o: PartOptions,
    textureSets: AssetDefinition['budget']['textureSets'] = sets,
    more: AssetDefinition['build'] = () => {},
  ) =>
    defineAsset({
      ...base,
      budget: { ...budget, ...(textureSets ? { textureSets } : {}) },
      ...(o.paint ? { paint: { [o.paint]: '#808080' } } : {}),
      ...(o.finish ? { finishes: { [o.finish]: { sheen: { colour: '#808080' } } } } : {}),
      build(ctx) {
        ctx.part('torso', merge([]), o);
        more(ctx);
      },
    });
  const fails = (re: RegExp, ...a: Parameters<typeof textured>) =>
    expect(thrown(() => compile(textured(...a)))).toMatch(re);

  it('refuses textures without budget.textureSets, and says what to declare', () => {
    const none = defineAsset({
      ...base,
      build: (ctx) => ctx.part('torso', merge([]), { textures: wolf }),
    });
    expect(thrown(() => compile(none))).toBe(
      'T3D_TEXTURE_INVALID|declare budget.textureSets: { count: 1, size: 2048 }',
    );
  });

  it('refuses a malformed budget.textureSets at defineAsset', () => {
    const bad = (textureSets: unknown) => define({ budget: { ...budget, textureSets } as never });
    expect(thrown(bad({ count: 0, size: 2048 }))).toMatch(/^T3D_TEXTURE_INVALID\|declare/);
    expect(thrown(bad({ count: 1.5, size: 2048 }))).toMatch(/^T3D_TEXTURE_INVALID/);
    expect(thrown(bad({ count: 1, size: 3000 }))).toMatch(/^T3D_TEXTURE_INVALID/);
    expect(thrown(bad({ count: 2, size: 4096 }))).toBe('none');
  });

  it('refuses a map over the declared size, non-PNG bytes and a non-square map', () => {
    fails(/^T3D_TEXTURE_INVALID\|.*1024²/, { textures: wolf }, { count: 1, size: 1024 });
    fails(/^T3D_TEXTURE_INVALID\|pass the PNG/, {
      textures: { name: 'wolf', albedo: new Uint8Array(64) },
    });
    const wide = png(2048);
    new DataView(wide.buffer, wide.byteOffset).setUint32(20, 1024);
    fails(/^T3D_TEXTURE_INVALID\|bake it square/, { textures: { name: 'wolf', albedo: wide } });
  });

  it('refuses paint, finish, a see-through surface or a group with textures: drop the option', () => {
    fails(/^T3D_TEXTURE_INVALID\|drop `paint`/, { textures: wolf, paint: 'body' });
    fails(/^T3D_TEXTURE_INVALID\|drop `finish`/, { textures: wolf, finish: 'velvet' });
    fails(/^T3D_TEXTURE_INVALID\|drop `surface`/, { textures: wolf, surface: 'glass' });
    fails(/^T3D_TEXTURE_INVALID\|drop `textures`/, {}, sets, (ctx) =>
      ctx.group('rig', { textures: wolf }),
    );
  });

  it('refuses one name with different bytes, and more names than the budget counts', () => {
    const other = (textures: TextureSet): AssetDefinition['build'] => {
      return (ctx) => ctx.part('head', merge([]), { textures });
    };
    fails(
      /^T3D_TEXTURE_INVALID\|share one TextureSet/,
      { textures: wolf },
      sets,
      other({
        ...wolf,
        albedo: png(2048, 7),
      }),
    );
    fails(
      /^T3D_TEXTURE_INVALID\|.*raise count to 2/,
      { textures: wolf },
      sets,
      other({
        ...wolf,
        name: 'eye',
      }),
    );
    // Equal bytes in a separate array are the same set; two names fit a count of 2.
    const copy = other({ ...wolf, albedo: png(2048) });
    expect(thrown(() => compile(textured({ textures: wolf }, sets, copy)))).toBe('none');
    const two = textured(
      { textures: wolf },
      { count: 2, size: 2048 },
      other({ ...wolf, name: 'eye' }),
    );
    expect(thrown(() => compile(two))).toBe('none');
  });

  it('wants an alpha channel on the albedo of a cutout part', () => {
    const rgb = png(2048);
    rgb[25] = 2;
    fails(/^T3D_TEXTURE_INVALID\|bake the albedo as RGBA/, {
      textures: { name: 'fur', albedo: rgb },
      surface: 'cutout',
    });
    expect(thrown(() => compile(textured({ textures: wolf, surface: 'cutout' })))).toBe('none');
  });

  it('carries the set through compile at every LOD and through ctx.use, name unprefixed', () => {
    const child = textured({ textures: wolf });
    for (const lod of [0, 1, 2] as const)
      expect(compile(child, { lod }).parts[0]?.textures).toBe(wolf);
    const pack = (textureSets?: typeof sets) =>
      defineAsset({
        ...base,
        name: 'pack',
        budget: { ...budget, ...(textureSets ? { textureSets } : {}) },
        build(ctx) {
          ctx.use(child, { prefix: 'a' });
          ctx.use(child, { prefix: 'b' });
        },
      });
    const out = compile(pack(sets), { lod: 2 });
    expect(out.parts.map((p) => [p.name, p.textures?.name])).toEqual([
      ['a', undefined],
      ['a_torso', 'wolf'],
      ['b', undefined],
      ['b_torso', 'wolf'],
    ]);
    // The parent counts its children's sets against its own budget.
    expect(thrown(() => compile(pack()))).toMatch(/^T3D_TEXTURE_INVALID\|declare/);
  });
});
