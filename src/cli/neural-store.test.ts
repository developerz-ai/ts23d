// provideRecipeNeural's miss text depends on where the recipe sits: a checkout says "run
// `t3d neural run` and commit", an installed package (which ships no recipes/*/neural/) says where
// the model outputs are. Both the notice and the `--require-neural` error carry it.

import { afterAll, describe, expect, it } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { isTs23dError } from '../core/index.ts';
import { provideRecipeNeural } from './neural-store.ts';

const dir = join(import.meta.dir, '../../tmp/cli-neural-store-test');
afterAll(() => rm(dir, { recursive: true, force: true }));

const REQ = { seed: 1, prompt: 'lichen', width: 4, height: 4 } as const;
const installed = join(dir, 'app/node_modules/@developerz.ai/ts23d/recipes/bear/bear.ts');
const checkout = join(dir, 'repo/recipes/bear/bear.ts');

const thrown = (run: () => unknown): unknown => {
  try {
    return run();
  } catch (e) {
    return e;
  }
};

describe('provideRecipeNeural: the fix of a miss', () => {
  it('installed package without neural/: the notice says the package ships no model outputs', async () => {
    const cache = await provideRecipeNeural(installed, ['bear'], false);
    const r = cache.get('image', REQ);
    const fix = r.fallback ? r.notice.fix : '';
    expect(fix).toContain('npm package does not ship model outputs');
    expect(fix).toContain('https://github.com/developerz-ai/ts23d');
    expect(fix).toContain('copy the recipe folder');
    expect(fix).toContain('t3d neural run');
    expect(fix).not.toContain('then commit');
  });

  it('installed package, --require-neural: the error carries the same fix', async () => {
    const cache = await provideRecipeNeural(installed, ['bear'], true);
    const e = thrown(() => cache.get('image', REQ));
    expect(isTs23dError(e) && e.code).toBe('T3D_NEURAL_MISSING');
    expect(isTs23dError(e) && e.fix).toContain('npm package does not ship model outputs');
  });

  it('a checkout keeps the run-and-commit fix', async () => {
    const r = (await provideRecipeNeural(checkout, ['bear'], false)).get('image', REQ);
    expect(r.fallback && r.notice.fix).toContain('t3d neural run recipes/bear/bear.ts');
    expect(r.fallback && r.notice.fix).toContain('then commit recipes/bear/neural/');
  });

  it('a package folder that does hold neural/ (a linked checkout) keeps the run-and-commit fix', async () => {
    const linked = join(dir, 'linked/node_modules/@developerz.ai/ts23d/recipes/bear');
    await mkdir(join(linked, 'neural'), { recursive: true });
    const r = (await provideRecipeNeural(join(linked, 'bear.ts'), ['bear'], false)).get(
      'image',
      REQ,
    );
    expect(r.fallback && r.notice.fix).toContain('then commit');
  });
});
