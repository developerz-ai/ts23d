import { afterAll, describe, expect, it } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Ts23dError } from '../core/index.ts';
import { mockAdapter } from '../neural/index.ts';
import { loadConfig, resolveConfig } from './config.ts';

const dir = join(import.meta.dir, '../../tmp/cli-config-test');
afterAll(() => rm(dir, { recursive: true, force: true }));
const lib = join(import.meta.dir, '../index.ts');

const codeOf = async (p: Promise<unknown>): Promise<string> =>
  p.then(
    () => 'ok',
    (e: unknown) => (e instanceof Ts23dError ? e.code : String(e)),
  );

describe('t3d.config.ts', () => {
  it('malformed configs → T3D_NEURAL_FAILED naming the field', () => {
    for (const bad of [
      { neural: { dance: mockAdapter() } },
      { neural: { image: { id: 'x' } } },
      { neural: { mesh: { adapter: mockAdapter(['image']) } } },
      { neural: { image: { adapter: mockAdapter(), model: 3 } } },
      { requireNeural: 'yes' },
    ])
      expect(() => resolveConfig(bad)).toThrow('T3D_NEURAL_FAILED');
  });

  it('a file that throws → T3D_RECIPE_THREW; no `config` export → T3D_NEURAL_FAILED', async () => {
    await Bun.write(join(dir, 'throws', 't3d.config.ts'), "throw new Error('boom');\n");
    await Bun.write(join(dir, 'none', 't3d.config.ts'), 'export const other = 1;\n');
    expect(await codeOf(loadConfig(join(dir, 'throws')))).toBe('T3D_RECIPE_THREW');
    expect(await codeOf(loadConfig(join(dir, 'none')))).toBe('T3D_NEURAL_FAILED');
  });

  it('no file = no adapters; a file binds tasks to adapters and pinned models', async () => {
    expect((await loadConfig(join(dir, 'empty'))).neural.size).toBe(0);
    await Bun.write(
      join(dir, 'ok', 't3d.config.ts'),
      `import { defineConfig, http, mockAdapter } from '${lib}';
export const config = defineConfig({
  neural: { mesh: http('http://127.0.0.1:9', 'pixal3d'), image: mockAdapter() },
  requireNeural: true,
});
`,
    );
    const c = await loadConfig(join(dir, 'ok'));
    expect([...c.neural.keys()].sort()).toEqual(['image', 'mesh']);
    expect(c.neural.get('mesh')?.model).toBe('pixal3d');
    expect(c.neural.get('mesh')?.adapter.id).toBe('http:http://127.0.0.1:9');
    expect(c.neural.get('image')?.adapter.id).toBe('mock');
    expect(c.requireNeural).toBe(true);
  });
});
