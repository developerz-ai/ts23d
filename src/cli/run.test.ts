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
  const code = await run([
    'build',
    fixture,
    '--out',
    out,
    '--size',
    '160x90',
    '--sheet-size',
    '512',
  ]);
  console.log = log;
  expect(code).toBe(0);
  for (const f of ['lod0.glb', 'lod1.glb', 'lod2.glb', 'crate.glb', 'hero.png', 'sheet.png']) {
    expect(await Bun.file(join(out, 'crate', f)).exists()).toBe(true);
  }
  const manifest = await Bun.file(join(out, 'crate', 'manifest.json')).json();
  expect(manifest.files.single).toBe(join(out, 'crate', 'crate.glb'));
  expect(manifest.lodCoverage).toHaveLength(3);
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
    '--size',
    '160x90',
  ]);
  console.log = log;
  expect(code).toBe(0);
  expect(await Bun.file(join(out, 'hero', 'crate', 'lod0.glb')).exists()).toBe(true);
  expect(await Bun.file(join(out, 'hero', 'crate', 'lod1.glb')).exists()).toBe(false);
  const manifest = await Bun.file(join(out, 'hero', 'crate', 'manifest.json')).json();
  expect(manifest.triangles).toHaveLength(1);
  expect(manifest.lodCoverage).toBeUndefined();
});

it('writes only the single MSFT_lod file with --lods single, only split files with split', async () => {
  const fixture = join(out, 'crate.ts');
  const log = console.log;
  console.log = () => {};
  const flags = ['--sheet', 'none', '--no-shot'];
  const single = await run([
    'build',
    fixture,
    '--out',
    join(out, 's'),
    '--lods',
    'single',
    ...flags,
  ]);
  const split = await run(['build', fixture, '--out', join(out, 'p'), '--lods', 'split', ...flags]);
  console.log = log;
  expect([single, split]).toEqual([0, 0]);
  expect(await Bun.file(join(out, 's', 'crate', 'lod0.glb')).exists()).toBe(false);
  expect(await Bun.file(join(out, 's', 'crate', 'crate.glb')).exists()).toBe(true);
  expect(await Bun.file(join(out, 'p', 'crate', 'crate.glb')).exists()).toBe(false);
  expect(await Bun.file(join(out, 'p', 'crate', 'lod2.glb')).exists()).toBe(true);
});

it('fails a bad --size with a coded error, before writing anything', async () => {
  const err = console.error;
  let printed = '';
  console.error = (m: string) => {
    printed += m;
  };
  const code = await run([
    'hero',
    join(out, 'crate.ts'),
    '--out',
    join(out, 'bad'),
    '--size',
    '9x9',
    '--json',
  ]);
  console.error = err;
  expect(code).toBe(1);
  expect(JSON.parse(printed).error.code).toBe('T3D_RENDER_OPTIONS');
  expect(await Bun.file(join(out, 'bad', 'crate', 'hero.png')).exists()).toBe(false);
});

it('renders a hero and a review pack', async () => {
  const fixture = join(out, 'crate.ts');
  const log = console.log;
  console.log = () => {};
  const hero = await run([
    'hero',
    fixture,
    '--out',
    join(out, 'r'),
    '--size',
    '64x48',
    '--sheet-size',
    '512',
  ]);
  const review = await run([
    'review',
    fixture,
    '--out',
    join(out, 'r'),
    '--size',
    '64x48',
    '--sheet-size',
    '512',
  ]);
  console.log = log;
  expect([hero, review]).toEqual([0, 0]);
  expect(await Bun.file(join(out, 'r', 'crate', 'hero.png')).exists()).toBe(true);
  for (const f of ['hero.png', 'lods.png', 'review.md', 'review.json'])
    expect(await Bun.file(join(out, 'r', 'crate', 'review', f)).exists()).toBe(true);
});
