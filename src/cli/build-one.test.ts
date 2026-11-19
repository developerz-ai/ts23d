import { expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile, cylinder, defineAsset, readGlbChunks } from '../index.ts';
import { parseArgs } from './args.ts';
import { buildOne, qaOf } from './build-one.ts';

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

it('fails budget.draws when a LOD needs more draw calls, after the chain findings', () => {
  expect(qaOf(inverted, lods).some((f) => f.gate === 'draw-calls')).toBe(false);
  const two = defineAsset({
    name: 'two',
    kind: 'prop',
    budget: { triangles: [2000, 2000, 2000], draws: 1 },
    build(ctx) {
      ctx.group('lid', { motion: { kind: 'spin', axis: [0, 0, 1], rps: 1 } });
      ctx.part('base', cylinder({ radius: 0.3, length: 1, segments: 8, color: [1, 1, 1] }));
      ctx.part(
        'cap',
        cylinder({ radius: 0.3, length: 0.1, segments: 8, at: [0, 0, 1], color: [1, 1, 1] }),
        { parent: 'lid' },
      );
    },
  });
  const found = qaOf(two, [compile(two, { lod: 0 })]);
  expect(found.at(-1)).toEqual({
    gate: 'draw-calls',
    code: 'T3D_QA_DRAW_CALLS',
    message: 'LOD0 needs 2 draw calls, budget.draws is 1',
    fix: 'give parts that move together one pivot (ctx.group) and share paint slots, so the export merges them; or raise budget.draws',
  });
});

it('lists no clips in the manifest when --no-animations writes GLBs without any', async () => {
  const spinner = defineAsset({
    name: 'spinner',
    kind: 'prop',
    budget: { triangles: [2000, 2000, 2000] },
    build(ctx) {
      ctx.group('rotor', { motion: { kind: 'spin', axis: [0, 0, 1], rps: 1 } });
      ctx.part('blade', cylinder({ radius: 0.3, length: 0.1, segments: 8, color: [1, 1, 1] }), {
        parent: 'rotor',
      });
    },
  });
  const out = await mkdtemp(join(tmpdir(), 't3d-build-one-'));
  try {
    const build = (flags: string[]) =>
      buildOne(
        spinner,
        parseArgs(['build', 'spinner.ts', '--no-shot', '--lods', '0', '--out', out, ...flags]),
        undefined,
        undefined,
      );
    expect((await build([])).clips?.map((c) => c.name)).toEqual(['run']);
    const still = await build(['--no-animations']);
    const glb = new Uint8Array(await Bun.file(join(out, 'spinner', 'lod0.glb')).arrayBuffer());
    expect(readGlbChunks(glb).json['animations']).toBeUndefined();
    expect(still.clips).toBeUndefined();
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
