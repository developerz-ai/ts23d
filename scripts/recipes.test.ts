import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recipeTests, sharedRecipeTests, staleOutputs } from './recipes.ts';

async function outputs(files: readonly string[], tris = [12, 8, 4]): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), 'ts23d-recipes-')), 'crate');
  await mkdir(join(dir, 'out', 'crate'), { recursive: true });
  for (const f of files)
    await writeFile(
      join(dir, 'out', 'crate', f),
      f === 'manifest.json' ? JSON.stringify({ triangles: tris }) : 'png',
    );
  return dir;
}

describe('staleOutputs', () => {
  it('reports a missing sheet.png beside hero.png and manifest.json', async () => {
    const dir = await outputs(['manifest.json', 'hero.png']);
    const v = await staleOutputs(dir, 'recipes/crate/crate.ts', 'crate', [12, 8, 4]);
    expect(v).toHaveLength(1);
    expect(v[0]?.message).toContain('no committed sheet.png');
    expect(v[0]?.fix).toContain('bun run shots crate');
  });

  it('reports stale triangles, passes fresh complete outputs', async () => {
    const dir = await outputs(['manifest.json', 'hero.png', 'sheet.png']);
    expect(await staleOutputs(dir, 'x.ts', 'crate', [12, 8, 4])).toEqual([]);
    const v = await staleOutputs(dir, 'x.ts', 'crate', [12, 8, 3]);
    expect(v[0]?.message).toContain('stale (tris 12/8/4 vs 12/8/3 now)');
  });

  it('compares the compiled count when the manifest carries one beside the file count', async () => {
    const dir = await outputs(['hero.png', 'sheet.png']);
    await writeFile(
      join(dir, 'out', 'crate', 'manifest.json'),
      JSON.stringify({ triangles: [10, 8, 4], trianglesCompiled: [12, 8, 4] }),
    );
    expect(await staleOutputs(dir, 'x.ts', 'crate', [12, 8, 4])).toEqual([]);
    const v = await staleOutputs(dir, 'x.ts', 'crate', [10, 8, 4]);
    expect(v[0]?.message).toContain('stale (tris 12/8/4 vs 10/8/4 now)');
  });
});

describe('recipeTests', () => {
  const tests = [
    'recipes/_lib/bust/head.test.ts',
    'recipes/_parts/wheel.test.ts',
    'recipes/t34/t34.test.ts',
    'recipes/t34/turret/turret.test.ts',
    'recipes/t34/out/t34/stray.test.ts',
    'recipes/wolf/wolf.test.ts',
    'recipes/wolf/wolf.ts',
  ];

  it("runs the shard's folders' tests plus only the shared tests it owns", () => {
    expect(recipeTests(tests, ['recipes/t34'], [])).toEqual([
      'recipes/t34/t34.test.ts',
      'recipes/t34/turret/turret.test.ts',
    ]);
    expect(recipeTests(tests, ['recipes/wolf'], ['recipes/_parts/wheel.test.ts'])).toEqual([
      'recipes/_parts/wheel.test.ts',
      'recipes/wolf/wolf.test.ts',
    ]);
  });

  it('runs every recipe test when it owns everything, and none from an empty shard', () => {
    const all = recipeTests(tests, ['recipes/t34', 'recipes/wolf'], sharedRecipeTests(tests));
    expect(all).toHaveLength(5);
    expect(recipeTests(tests, [], [])).toEqual([]);
  });

  it('lists the shared recipes/_*/ tests, never outputs or non-tests', () => {
    expect(
      sharedRecipeTests([...tests, 'recipes/_lib/out/x.test.ts', 'recipes/_lib/a.ts']),
    ).toEqual(['recipes/_lib/bust/head.test.ts', 'recipes/_parts/wheel.test.ts']);
  });
});
