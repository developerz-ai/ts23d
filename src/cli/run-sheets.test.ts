import { afterAll, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Asset, defineAsset } from '../core/index.ts';
import { readGlbChunks } from '../export/index.ts';
import { defineMaterial, materialSnapshot, resetMaterials } from '../material/index.ts';
import { box } from '../primitives/index.ts';
import { parseArgs } from './args.ts';
import { buildOne } from './build-one.ts';
import { runSheets } from './run-sheets.ts';

// Put back what other test files' recipes defined at import (materialSnapshot).
const restoreMaterials = materialSnapshot();
resetMaterials();
afterAll(restoreMaterials);

const crate = (name: string, strip: Parameters<typeof box>[0]['strip']): Asset =>
  defineAsset({
    name,
    kind: 'prop',
    budget: { triangles: [12, 12, 12] },
    build: (ctx) =>
      ctx.part('body', box({ size: [1, 1, 1], color: [1, 1, 1], ...(strip ? { strip } : {}) })),
  });
// Three "recipes": two with a material of their own on row 4, one on built-in strips only.
const rock = crate('sheets_rock', defineMaterial({ id: 'sheets_granite', roughness: 0.9, row: 4 }));
const snake = crate(
  'sheets_snake',
  defineMaterial({ id: 'sheets_scales', roughness: 0.3, row: 4 }),
);
const plank = crate('sheets_plank', 'oak');

const bytes = async (path: string): Promise<Uint8Array> =>
  new Uint8Array(await Bun.file(path).arrayBuffer());
const uriOf = async (path: string): Promise<unknown> =>
  (readGlbChunks(await bytes(path)).json['images'] as { uri?: string }[] | undefined)?.[0]?.uri;

async function build(order: readonly Asset[], ...flags: string[]): Promise<string> {
  const out = await mkdtemp(join(tmpdir(), 't3d-run-sheets-'));
  const args = parseArgs([
    'build',
    'x.ts',
    '--no-shot',
    '--sheet-size',
    '512',
    '--out',
    out,
    ...flags,
  ]);
  const sheets = runSheets(args);
  for (const asset of order) await buildOne(asset, args, sheets);
  return out;
}

it('fails before D299: --sheet embed gives each asset the same GLB bytes alone and in either order of a run', async () => {
  const hash = async (out: string, a: Asset): Promise<number | bigint> =>
    Bun.hash(await bytes(join(out, a.name, 'lod0.glb')));
  const outs = [await build([rock, snake, plank], '--sheet', 'embed')];
  outs.push(await build([plank, snake, rock], '--sheet', 'embed'));
  for (const a of [rock, snake, plank]) {
    const alone = await build([a], '--sheet', 'embed');
    outs.push(alone);
    expect(await hash(outs[0] ?? '', a)).toBe(await hash(alone, a));
    expect(await hash(outs[1] ?? '', a)).toBe(await hash(alone, a));
  }
  expect(await hash(outs[0] ?? '', rock)).not.toBe(await hash(outs[0] ?? '', snake));
  for (const out of outs) await rm(out, { recursive: true });
}, 60000);

it('--sheet external: the run shares one sheet while materials fit, and an asset that cannot share gets its own', async () => {
  const out = await build([rock, plank, snake]);
  try {
    expect(await uriOf(join(out, 'sheets_rock', 'lod0.glb'))).toBe('../trim_sheet_albedo.png');
    expect(await uriOf(join(out, 'sheets_plank', 'lod0.glb'))).toBe('../trim_sheet_albedo.png');
    // Row 4 of the shared sheet is the rock's granite: the snake's scales cannot be on it too.
    expect(await uriOf(join(out, 'sheets_snake', 'lod0.glb'))).toBe('trim_sheet_albedo.png');
    const shared = await bytes(join(out, 'trim_sheet_orm.png'));
    const own = await bytes(join(out, 'sheets_snake', 'trim_sheet_orm.png'));
    expect(Bun.hash(shared)).not.toBe(Bun.hash(own));
    // Alone, each writes the shared name it always wrote, with its own material on the row.
    const alone = await build([snake]);
    expect(await uriOf(join(alone, 'sheets_snake', 'lod0.glb'))).toBe('../trim_sheet_albedo.png');
    expect(Bun.hash(await bytes(join(alone, 'trim_sheet_orm.png')))).toBe(Bun.hash(own));
    await rm(alone, { recursive: true });
  } finally {
    await rm(out, { recursive: true });
  }
}, 60000);
