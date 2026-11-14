import { afterAll, expect, it } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Ts23dError } from '../core/index.ts';
import { loadAssets, recipeThrew } from './load.ts';

const dir = join(import.meta.dir, '../../tmp/cli-load-test');
afterAll(() => rm(dir, { recursive: true, force: true }));

const codeOf = async (file: string): Promise<string | undefined> => {
  try {
    await loadAssets(file);
  } catch (e) {
    if (e instanceof Ts23dError) return e.code;
  }
  return undefined;
};

it('a missing file is T3D_RECIPE_NOT_FOUND; a parse or import failure is T3D_RECIPE_THREW', async () => {
  await Bun.write(join(dir, 'syntax.ts'), 'export const x = ;\n');
  await Bun.write(join(dir, 'imports.ts'), "import './nope.ts';\nexport const y = 1;\n");
  expect(await codeOf(join(dir, 'missing.ts'))).toBe('T3D_RECIPE_NOT_FOUND');
  expect(await codeOf(join(dir, 'syntax.ts'))).toBe('T3D_RECIPE_THREW');
  expect(await codeOf(join(dir, 'imports.ts'))).toBe('T3D_RECIPE_THREW');
});

it('wraps an uncoded throw with the recipe frame, passes a coded one through', () => {
  const file = join(dir, 'r.ts');
  const e = new Error('kaboom');
  e.stack = `Error: kaboom\n    at build (${file}:3:9)\n    at compile (/x/asset.ts:1:1)`;
  const wrapped = recipeThrew(e, file, "r's build()");
  expect(wrapped.code).toBe('T3D_RECIPE_THREW');
  expect(wrapped.message).toContain('kaboom');
  expect(wrapped.message).toContain('r.ts:3:9');
  expect(wrapped.message).not.toContain('asset.ts');
  const coded = new Ts23dError('T3D_RECIPE_INVALID', { cause: 'c', fix: 'f' });
  expect(recipeThrew(coded, file, 'x')).toBe(coded);
});
