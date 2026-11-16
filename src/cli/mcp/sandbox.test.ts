import { afterAll, expect, it } from 'bun:test';
import { mkdir, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Ts23dError } from '../../core/index.ts';
import { confine, sandboxOf } from './sandbox.ts';

const base = join(import.meta.dir, '../../../tmp/mcp-sandbox-test');
const root = join(base, 'project');
afterAll(() => rm(base, { recursive: true, force: true }));

const code = (f: () => unknown): string | undefined => {
  try {
    f();
  } catch (e) {
    return e instanceof Ts23dError ? e.code : 'other';
  }
  return undefined;
};

it('refuses paths that climb out of the project', async () => {
  await mkdir(join(root, 'recipes'), { recursive: true });
  const box = sandboxOf(root);
  expect(code(() => confine(box, '../secret.ts', 'recipe'))).toBe('T3D_CLI_USAGE');
  expect(code(() => confine(box, '/etc/passwd', 'recipe'))).toBe('T3D_CLI_USAGE');
});

it('refuses a symlink that points outside the project', async () => {
  await mkdir(join(base, 'outside'), { recursive: true });
  await symlink(join(base, 'outside'), join(root, 'escape'));
  const box = sandboxOf(root);
  expect(code(() => confine(box, 'escape/x.ts', 'recipe'))).toBe('T3D_CLI_USAGE');
});

it('accepts paths inside the root, and an --out directory elsewhere for outputs only', () => {
  const box = sandboxOf(root, join(base, 'renders'));
  expect(confine(box, 'recipes/a/a.ts', 'recipe')).toBe(join(box.root, 'recipes/a/a.ts'));
  expect(confine(box, join(base, 'renders', 'wolf'), 'out')).toBe(join(box.out, 'wolf'));
  expect(code(() => confine(box, join(base, 'renders', 'x.ts'), 'recipe', [box.root]))).toBe(
    'T3D_CLI_USAGE',
  );
});
