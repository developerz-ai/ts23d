import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { runQa } from './gates.ts';

const c: [number, number, number] = [1, 1, 1];

describe('qa', () => {
  it('passes a grounded asset under budget', () => {
    const a = defineAsset({
      name: 'ok',
      kind: 'prop',
      budget: { triangles: [24, 24, 24] },
      build: (ctx) => {
        ctx.part('base', box({ size: [1, 1, 1], color: c }));
        ctx.part('top', box({ size: [0.5, 0.5, 0.5], color: c }), { at: [0, 0, 1] });
      },
    });
    expect(runQa(compile(a))).toEqual([]);
  });

  it('flags floating parts and budget overruns', () => {
    const a = defineAsset({
      name: 'bad',
      kind: 'prop',
      budget: { triangles: [12, 12, 12] },
      build: (ctx) => {
        ctx.part('base', box({ size: [1, 1, 1], color: c }));
        ctx.part('ghost', box({ size: [1, 1, 1], color: c }), { at: [0, 0, 5] });
      },
    });
    expect(
      runQa(compile(a))
        .map((f) => f.gate)
        .sort(),
    ).toEqual(['floating-parts', 'triangle-budget']);
  });
});
