import { afterAll, expect, it } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { run } from './run.ts';

const out = join(import.meta.dir, '../../tmp/cli-test');
afterAll(() => rm(out, { recursive: true, force: true }));

it('writes one folder per asset with LODs, sheet and manifest', async () => {
  const fixture = join(out, 'crate.ts');
  await Bun.write(
    fixture,
    `import { box, defineAsset } from '${join(import.meta.dir, '../index.ts')}';
export const crate = defineAsset({ name: 'crate', kind: 'prop', budget: { triangles: [12, 12, 12] },
  build: (ctx) => ctx.part('body', box({ size: [1, 1, 1], color: [1, 1, 1] })) });`,
  );
  const log = console.log;
  console.log = () => {};
  const code = await run(['build', fixture, '--out', out]);
  console.log = log;
  expect(code).toBe(0);
  for (const f of ['lod0.glb', 'lod1.glb', 'lod2.glb', 'sheet.png', 'manifest.json']) {
    expect(await Bun.file(join(out, 'crate', f)).exists()).toBe(true);
  }
  const manifest = await Bun.file(join(out, 'crate', 'manifest.json')).json();
  expect(manifest.pivots.map((p: { name: string }) => p.name)).toEqual(['body']);
  expect((await Bun.file(join(out, 'index.json')).json()).ok).toBe(true);
});

it('builds only the LODs asked for', async () => {
  const fixture = join(out, 'crate.ts');
  const log = console.log;
  console.log = () => {};
  const code = await run([
    'build',
    fixture,
    '--out',
    join(out, 'hero'),
    '--lods',
    '0',
    '--sheet',
    'none',
  ]);
  console.log = log;
  expect(code).toBe(0);
  expect(await Bun.file(join(out, 'hero', 'crate', 'lod0.glb')).exists()).toBe(true);
  expect(await Bun.file(join(out, 'hero', 'crate', 'lod1.glb')).exists()).toBe(false);
  const manifest = await Bun.file(join(out, 'hero', 'crate', 'manifest.json')).json();
  expect(manifest.triangles).toHaveLength(1);
});
