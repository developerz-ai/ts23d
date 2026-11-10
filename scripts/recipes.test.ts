import { afterEach, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { staleOutputs } from './recipes.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const fresh = {
  'manifest.json': new TextEncoder().encode('{"triangles":[12,6,3]}\n'),
  'hero.png': new Uint8Array([1, 2, 3]),
  'sheet.png': new Uint8Array([4, 5, 6]),
};

async function outputDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ts23d-recipes-'));
  roots.push(root);
  const out = join(root, 'out', 'fixture');
  for (const [name, bytes] of Object.entries(fresh)) await Bun.write(join(out, name), bytes);
  return root;
}

it('rejects a stale render even when the manifest triangle counts are unchanged', async () => {
  const root = await outputDir();
  await Bun.write(join(root, 'out', 'fixture', 'hero.png'), new Uint8Array([9, 2, 3]));

  const violations = await staleOutputs(root, 'recipes/fixture/fixture.ts', 'fixture', fresh);

  expect(violations).toHaveLength(1);
  expect(violations[0]?.message).toContain('hero.png differs');
  expect(violations[0]?.message).not.toContain('manifest.json differs');
  expect(violations[0]?.fix).toContain('bun run shots');
});

it.each([
  ['manifest.json', new Uint8Array([0])],
  ['sheet.png', new Uint8Array([0])],
])('rejects a stale %s', async (name, bytes) => {
  const root = await outputDir();
  await Bun.write(join(root, 'out', 'fixture', name), bytes);

  const violations = await staleOutputs(root, 'recipes/fixture/fixture.ts', 'fixture', fresh);

  expect(violations).toHaveLength(1);
  expect(violations[0]?.message).toContain(`${name} differs`);
});
