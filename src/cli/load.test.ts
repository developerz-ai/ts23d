import { afterAll, expect, it } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { isTs23dError, Ts23dError } from '../core/index.ts';
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

it('passes through a coded error from another copy of the library, code and fix intact', () => {
  class OtherCopy extends Error {
    readonly code = 'T3D_RECIPE_INVALID';
    readonly fix = 'give color: hex(…)';
    override name = 'Ts23dError';
    toJSON(): { code: string; message: string; fix: string } {
      return { code: this.code, message: this.message, fix: this.fix };
    }
  }
  const e = new OtherCopy('T3D_RECIPE_INVALID: bad');
  e.stack = `Ts23dError: bad\n    at build (${join(dir, 'r.ts')}:7:28)`;
  const out = recipeThrew(e, join(dir, 'r.ts'), 'x');
  expect(out.code).toBe('T3D_RECIPE_INVALID');
  expect(out.fix).toBe('give color: hex(…)');
});

it('with no frame in the recipe, the fix shows the top three stack frames, not `bun <file>`', () => {
  const e = new TypeError("undefined is not an object (evaluating 'pose.offset')");
  e.stack = [
    `TypeError: ${e.message}`,
    '    at poseAt (/lib/src/core/motion-pose.ts:40:12)',
    '    at bake (/lib/src/core/clip.ts:88:3)',
    '    at compile (/lib/src/core/asset.ts:120:9)',
    '    at buildOne (/lib/src/cli/build-one.ts:30:5)',
  ].join('\n');
  const out = recipeThrew(e, join(dir, 'r.ts'), "r's build()");
  expect(out.fix).not.toContain('prints the full error');
  expect(out.fix).toContain('motion-pose.ts:40:12');
  expect(out.fix).toContain('asset.ts:120:9');
  expect(out.fix).not.toContain('build-one.ts');
});

it('a missing package (fresh `t3d init` before install) says to install, not to fix the recipe', () => {
  const e = new Error(
    `Cannot find package '@developerz.ai/ts23d' imported from ${join(dir, 'r.ts')}`,
  );
  e.stack = `ResolveMessage: ${e.message}`;
  const out = recipeThrew(e, join(dir, 'r.ts'), 'loading r.ts');
  expect(out.code).toBe('T3D_RECIPE_THREW');
  expect(out.fix).toContain('bun install');
  expect(out.fix).toContain('bun add -d @developerz.ai/ts23d');
  const other = recipeThrew(new Error("Cannot find package 'zod' imported from x"), 'r.ts', 'l');
  expect(other.fix).toContain('bun add zod');
});

it('a missing recipe names both the repo and the `t3d init` project layouts', async () => {
  try {
    await loadAssets(join(dir, 'gone.ts'));
  } catch (e) {
    expect(isTs23dError(e) && e.fix).toContain('assets/');
    return;
  }
  throw new Error('expected T3D_RECIPE_NOT_FOUND');
});
