import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from './asset.ts';
import type { AssetDefinition } from './definition.ts';
import type { Ts23dError } from './errors.ts';
import { MeshBuilder } from './mesh.ts';
import { linearToHex, srgbToLinear, tone } from './paint.ts';

const budget = { triangles: [10, 10, 10] as const };
const tri = (c: readonly [number, number, number]) => {
  const b = new MeshBuilder();
  const v = (p: [number, number, number]) => b.vertex({ p, n: [0, 0, 1], uv: [0, 0], color: c });
  return b.tri(v([0, 0, 0]), v([1, 0, 0]), v([0, 1, 0])).build();
};
const car = (over: Partial<AssetDefinition> = {}, slot = 'body') =>
  defineAsset({
    name: 'car',
    kind: 'vehicle',
    budget,
    paint: { body: [0.5, 0.25, 0.1] },
    variants: { blue: { body: [0.1, 0.2, 0.5] } },
    build(ctx) {
      ctx.part('shell', tri([0.4, 0.2, 0.08]), { paint: slot });
      ctx.part('wheel', tri([0.2, 0.2, 0.2]));
    },
    ...over,
  });

describe('paint slots and variants', () => {
  it('refuses a part in an undeclared slot, naming the slots', () => {
    expect(() => compile(car({}, 'roof'))).toThrow(/slot 'roof'.*does not declare/);
    try {
      compile(car({}, 'roof'));
    } catch (e) {
      expect((e as Ts23dError).fix).toContain('body');
    }
  });

  it('refuses a variant repainting an unknown slot, variants without paint, bad colours', () => {
    expect(() => compile(car({ variants: { x: { hull: '#112233' } } }))).toThrow(/slot 'hull'/);
    expect(() => compile(car({ paint: {} }))).toThrow(/variants but no paint/);
    expect(() => compile(car({ paint: { body: 'red' } }))).toThrow(/#rrggbb/);
    expect(() => compile(car({ paint: { body: '#000000' } }))).toThrow(/not all zero/);
    expect(() => compile(car({ variants: { 'Bad-Name': {} } }))).toThrow(/snake_case/);
  });

  it('refuses a painted part brighter than its slot (it would clamp), naming the fix', () => {
    const iron = defineAsset({
      name: 'door',
      kind: 'prop',
      budget,
      paint: { body: [0.2, 0.1, 0.05] },
      build: (ctx) => ctx.part('door', tri([0.4, 0.4, 0.4]), { paint: 'body' }),
    });
    expect(() => compile(iron)).toThrow(/brighter than paint slot 'body'/);
  });

  it('refuses painted glass and an unknown preview variant', () => {
    const glass = defineAsset({
      name: 'g',
      kind: 'prop',
      budget,
      paint: { body: '#808080' },
      build: (ctx) => ctx.part('pane', tri([1, 1, 1]), { paint: 'body', surface: 'glass' }),
    });
    expect(() => compile(glass)).toThrow(/opaque only|painted/);
    expect(() => compile(car(), { variant: 'green' })).toThrow(/no variant 'green'/);
    try {
      compile(car(), { variant: 'green' });
    } catch (e) {
      expect((e as Ts23dError).fix).toContain('pick one of: blue');
    }
  });

  it('carries slots on parts and the normalised paint set on the asset', () => {
    const out = compile(car({ paint: { body: '#ff8000' } }));
    expect(out.parts.map((p) => p.paint)).toEqual(['body', undefined]);
    expect(out.paintSet?.paint['body']?.[0]).toBeCloseTo(1);
    expect(out.paintSet?.variants['blue']?.['body']).toEqual([0.1, 0.2, 0.5]);
    expect(out.variant).toBeUndefined();
  });

  it('previews a variant: painted colours × (variant / default), the rest untouched', () => {
    const out = compile(car(), { variant: 'blue' });
    const shell = out.parts[0]?.mesh?.colors;
    expect([...(shell ?? []).slice(0, 3)].map((v) => +v.toFixed(4))).toEqual([0.08, 0.16, 0.4]);
    expect([...(out.parts[1]?.mesh?.colors ?? []).slice(0, 3)].map((v) => +v.toFixed(4))).toEqual([
      0.2, 0.2, 0.2,
    ]);
    expect(out.variant).toBe('blue');
  });

  it('assets without paint compile exactly as before (no paint fields)', () => {
    const plain = compile(
      defineAsset({
        name: 'p',
        kind: 'prop',
        budget,
        build: (ctx) => ctx.part('a', tri([1, 1, 1])),
      }),
    );
    expect('paintSet' in plain).toBe(false);
    expect('paint' in (plain.parts[0] ?? {})).toBe(false);
  });

  it('tone divides per channel, borrows the mean for channels the slot lacks, clamps', () => {
    expect(tone([0.4, 0.2, 0.05], [0.5, 0.25, 0.1])).toEqual([0.8, 0.8, 0.5]);
    // Pure red slot: G/B take the R ratio (no divide by zero), so a repaint keeps the shade.
    expect(tone([0.5, 0, 0], [1, 0, 0])).toEqual([0.5, 0.5, 0.5]);
    expect(tone([1, 1, 1], [0.5, 0.5, 0.5])).toEqual([1, 1, 1]);
  });

  it('round-trips sRGB hex through linear', () => {
    for (const h of ['#84402d', '#e8e2d2', '#060606']) expect(linearToHex(srgbToLinear(h))).toBe(h);
  });
});
