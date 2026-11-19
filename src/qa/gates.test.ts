import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { emptyAsset, proportions, runQa } from './gates.ts';

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

describe('empty gate', () => {
  // The only mesh is behind `ctx.lod < 2`: LOD2 would export a GLB with no meshes at all.
  const gated = defineAsset({
    name: 'gated',
    kind: 'prop',
    budget: { triangles: [99, 99, 99] },
    build: (ctx) => {
      ctx.group('pivot', { at: [0, 0, 1] });
      if (ctx.lod < 2) ctx.part('body', box({ size: [1, 1, 1], color: c }));
    },
  });

  it('fails a LOD with no triangles, naming the LOD', () => {
    const f = runQa(compile(gated, { lod: 2 }));
    expect(f.map((x) => x.code)).toEqual(['T3D_QA_EMPTY']);
    expect(f[0]?.message).toContain('LOD2');
  });

  it('passes the LODs that have geometry', () => {
    expect(emptyAsset(compile(gated, { lod: 1 }))).toEqual([]);
  });
});

describe('proportions gate: unit mistakes', () => {
  const crate = (real: { length: number; width: number; height: number }, size: number) =>
    compile(
      defineAsset({
        name: 'crate',
        kind: 'prop',
        real,
        budget: { triangles: [99, 99, 99] },
        build: (ctx) => {
          ctx.part('body', box({ size: [size, size, size], color: c }));
        },
      }),
    );

  it('says `real` looks like millimetres or centimetres when it is 1000× or 100× the model', () => {
    const [mm] = proportions(crate({ length: 400, width: 400, height: 400 }, 0.4));
    expect(mm?.fix).toContain('`real` is in metres; 400 looks like millimetres → 0.4');
    const [cmF] = proportions(crate({ length: 41, width: 41, height: 41 }, 0.4));
    expect(cmF?.fix).toContain('41 looks like centimetres → 0.41');
  });

  it('says the geometry looks like millimetres when the model is 1000× `real`', () => {
    const [f] = proportions(crate({ length: 0.4, width: 0.4, height: 0.4 }, 400));
    expect(f?.fix).toContain('the model is ~1000× `real`');
  });

  it('keeps the plain rescale fix for an ordinary miss', () => {
    const [f] = proportions(crate({ length: 0.5, width: 0.5, height: 0.5 }, 0.4));
    expect(f?.fix).toContain('rescale along X');
    expect(f?.fix).not.toContain('looks like');
  });
});
