import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from './asset.ts';
import type { BuildContext } from './definition.ts';
import { Ts23dError } from './errors.ts';
import type { TuneSpec } from './tune.ts';

const budget = { triangles: [10, 10, 10] as const };
const objectives: TuneSpec['objectives'] = [{ kind: 'custom', name: 'zero', score: () => 0 }];

const code = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return e instanceof Ts23dError ? e.code : 'not a Ts23dError';
  }
  return 'no throw';
};

const define = (tune: TuneSpec, seen: number[] = []) =>
  defineAsset({
    name: 'knob',
    kind: 'prop',
    budget,
    tune,
    build(ctx: BuildContext) {
      seen.push(ctx.tuned('w'));
    },
  });

describe('tune declaration', () => {
  it('refuses impossible ranges with T3D_TUNE_INVALID', () => {
    const bad: Record<string, { min: number; max: number; default: number; step?: number }> = {
      inverted: { min: 2, max: 1, default: 1.5 },
      empty: { min: 1, max: 1, default: 1 },
      outside: { min: 0, max: 1, default: 2 },
      nan: { min: 0, max: Number.NaN, default: 0 },
      step: { min: 0, max: 1, default: 0.5, step: 0 },
    };
    for (const p of Object.values(bad))
      expect(code(() => define({ params: { w: p }, objectives }))).toBe('T3D_TUNE_INVALID');
    expect(code(() => define({ params: {}, objectives }))).toBe('T3D_TUNE_INVALID');
    expect(
      code(() => define({ params: { w: { min: 0, max: 1, default: 0.5 } }, objectives: [] })),
    ).toBe('T3D_TUNE_INVALID');
  });

  it('ctx.tuned: override beats tune.json beats the default', () => {
    const seen: number[] = [];
    const params = { w: { min: 0, max: 1, default: 0.5 } };
    compile(define({ params, objectives }, seen));
    compile(define({ params, objectives, saved: { knob: { values: { w: 0.25 } } } }, seen));
    compile(define({ params, objectives, saved: { knob: { values: { w: 0.25 } } } }, seen), {
      tuned: { w: 0.75 },
    });
    // A tune.json written for another asset in the same folder leaves this one at its default.
    compile(define({ params, objectives, saved: { other: { values: { w: 0.1 } } } }, seen));
    expect(seen).toEqual([0.5, 0.25, 0.75, 0.5]);
  });

  it('refuses stale or out-of-range tune.json values, unknown names and undeclared tune', () => {
    const params = { w: { min: 0, max: 1, default: 0.5 } };
    expect(
      code(() => compile(define({ params, objectives, saved: { knob: { values: { w: 3 } } } }))),
    ).toBe('T3D_TUNE_INVALID');
    expect(
      code(() => compile(define({ params, objectives, saved: { knob: { values: { h: 1 } } } }))),
    ).toBe('T3D_TUNE_INVALID');
    expect(code(() => compile(define({ params, objectives, saved: { knob: 'x' } })))).toBe(
      'T3D_TUNE_INVALID',
    );
    expect(code(() => compile(define({ params, objectives }), { tuned: { w: -1 } }))).toBe(
      'T3D_TUNE_INVALID',
    );
    const unknown = defineAsset({
      name: 'unknown',
      kind: 'prop',
      budget,
      tune: { params, objectives },
      build: (ctx) => void ctx.tuned('nope'),
    });
    expect(code(() => compile(unknown))).toBe('T3D_TUNE_INVALID');
    const plain = defineAsset({
      name: 'plain',
      kind: 'prop',
      budget,
      build: (ctx) => void ctx.tuned('w'),
    });
    expect(code(() => compile(plain))).toBe('T3D_TUNE_INVALID');
  });

  it('rejects prototype names: ctx.tuned("constructor") and a tune.json "toString"', () => {
    const params = { w: { min: 0, max: 1, default: 0.5 } };
    const proto = defineAsset({
      name: 'proto',
      kind: 'prop',
      budget,
      tune: { params, objectives },
      build: (ctx) => void ctx.tuned('constructor'),
    });
    expect(code(() => compile(proto))).toBe('T3D_TUNE_INVALID');
    expect(
      code(() =>
        compile(define({ params, objectives, saved: { knob: { values: { toString: 0.5 } } } })),
      ),
    ).toBe('T3D_TUNE_INVALID');
  });
});
