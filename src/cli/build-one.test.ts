import { expect, it } from 'bun:test';
import { compile, cylinder, defineAsset } from '../index.ts';
import { drawFindings, qaOf } from './build-one.ts';

/** LOD2 with more segments than LOD0: per-LOD gates pass, the chain does not. */
const inverted = defineAsset({
  name: 'inverted',
  kind: 'prop',
  budget: { triangles: [2000, 2000, 2000], draws: 1 },
  build: (ctx) =>
    ctx.part(
      'drum',
      cylinder({ radius: 0.3, length: 1, segments: ctx.pick([8, 32, 128]), color: [1, 1, 1] }),
    ),
});
const lods = ([0, 1, 2] as const).map((lod) => compile(inverted, { lod }));

it('fails a LOD chain whose triangles grow, with lod-triangles findings', () => {
  const found = qaOf(inverted, lods);
  expect(found.filter((f) => f.gate === 'lod-triangles').map((f) => f.code)).toEqual([
    'T3D_QA_LOD_TRIANGLES',
    'T3D_QA_LOD_TRIANGLES',
  ]);
  // One LOD alone has no chain to check.
  expect(qaOf(inverted, lods.slice(0, 1)).some((f) => f.gate === 'lod-triangles')).toBe(false);
});

it('fails budget.draws when a LOD needs more draw calls', () => {
  expect(drawFindings(inverted, lods)).toEqual([]);
  const two = defineAsset({
    name: 'two',
    kind: 'prop',
    budget: { triangles: [2000, 2000, 2000], draws: 1 },
    build(ctx) {
      ctx.group('lid', { motion: { kind: 'spin', axis: [0, 0, 1], rps: 1 } });
      ctx.part('base', cylinder({ radius: 0.3, length: 1, segments: 8, color: [1, 1, 1] }));
      ctx.part(
        'cap',
        cylinder({ radius: 0.3, length: 0.1, segments: 8, at: [0, 0, 0.55], color: [1, 1, 1] }),
        { parent: 'lid' },
      );
    },
  });
  const found = drawFindings(two, [compile(two, { lod: 0 })]);
  expect(found.map((f) => f.code)).toEqual(['T3D_QA_DRAW_CALLS']);
  expect(found[0]?.message).toContain('budget.draws is 1');
});
