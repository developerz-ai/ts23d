import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from './asset.ts';
import type { AssetDefinition, Measure } from './definition.ts';
import { Ts23dError } from './errors.ts';
import { merge } from './mesh.ts';
import type { Lod } from './part.ts';

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
