import { afterAll, beforeAll, expect, it } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { sandboxOf } from './sandbox.ts';
import { callTool, type ToolResult } from './tools.ts';

const root = join(import.meta.dir, '../../../tmp/mcp-tools-test');
const lib = join(import.meta.dir, '../../index.ts');
const box = () => sandboxOf(root);

beforeAll(async () => {
  await Bun.write(
    join(root, 'recipes/crate/crate.ts'),
    `import { box, defineAsset } from '${lib}';
export const crate = defineAsset({ name: 'crate', kind: 'prop', budget: { triangles: [12, 12, 12] },
  build: (ctx) => ctx.part('body', box({ size: [1, 1, 1], color: [1, 1, 1] })) });`,
  );
  await Bun.write(
    join(root, 'recipes/broken/broken.ts'),
    `import { defineAsset } from '${lib}';
export const broken = defineAsset({ name: 'broken', kind: 'prop', budget: { triangles: [12, 12, 12] },
  build: () => { throw new Error('boom'); } });`,
  );
  await Bun.write(join(root, 'recipes/crate/helper.ts'), 'export const size = 1;');
  await Bun.write(join(root, 'recipes/_lib/part.ts'), 'export const x = 1;');
});
afterAll(() => rm(root, { recursive: true, force: true }));

const json = (r: ToolResult): Record<string, unknown> => {
  const first = r.content[0];
  return first?.type === 'text' ? JSON.parse(first.text) : {};
};
const errorCode = (r: ToolResult): unknown =>
  (json(r)['error'] as { code?: string } | undefined)?.code;

it('refuses bad arguments with T3D_CLI_USAGE and a fix', async () => {
  for (const args of [{}, { recipe: 3 }, { recipe: 'a.ts', nope: 1 }, 'a.ts']) {
    const r = await callTool(box(), 'build', args);
    expect(r.isError).toBe(true);
    expect(errorCode(r)).toBe('T3D_CLI_USAGE');
    expect((json(r)['error'] as { fix: string }).fix.length).toBeGreaterThan(0);
  }
});

it('refuses a recipe or an out directory outside the project', async () => {
  const r = await callTool(box(), 'shot', { recipe: '../../package.json' });
  expect(errorCode(r)).toBe('T3D_CLI_USAGE');
  const o = await callTool(box(), 'shot', { recipe: 'recipes/crate/crate.ts', out: '/tmp' });
  expect(errorCode(o)).toBe('T3D_CLI_USAGE');
});

it('returns T3D_RECIPE_THREW when the recipe throws', async () => {
  const r = await callTool(box(), 'build', { recipe: 'recipes/broken/broken.ts', sheetSize: 512 });
  expect(r.isError).toBe(true);
  expect(errorCode(r)).toBe('T3D_RECIPE_THREW');
});

it('builds: QA verdict, triangles and project-relative paths, no image', async () => {
  const r = await callTool(box(), 'build', { recipe: 'recipes/crate/crate.ts', sheetSize: 512 });
  expect(r.isError).toBeUndefined();
  const [asset] = json(r)['assets'] as { asset: string; qa: string; manifest: string }[];
  expect(asset).toMatchObject({ asset: 'crate', qa: 'PASS', manifest: 'out/crate/manifest.json' });
  expect(r.content.some((c) => c.type === 'image')).toBe(false);
  expect(await Bun.file(join(root, 'out/crate/lod0.glb')).exists()).toBe(true);
}, 30_000);

it('lists recipes, skipping _lib folders and sibling modules without assets', async () => {
  const r = await callTool(box(), 'list_recipes', {});
  expect(json(r)).toEqual({
    recipes: [
      { asset: 'broken', file: 'recipes/broken/broken.ts' },
      { asset: 'crate', file: 'recipes/crate/crate.ts' },
    ],
  });
}, 30_000);

it('explains an error code', async () => {
  const r = await callTool(box(), 'explain_error', { code: 'T3D_RECIPE_THREW' });
  const [row] = json(r)['explained'] as { section: string }[];
  expect(row?.section).toBe('CLI codes');
});
