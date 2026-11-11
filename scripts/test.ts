// Runs the test suite locally and distributes recipe tests across CI shards.

import { type Shard, inShard, parseShard } from './lib/shard.ts';

export const STANDARD_TEST_ROOTS = ['src', 'scripts', 'examples', 'apps/site/src'] as const;

/** Discover recipe tests in a stable order so each CI shard owns a fixed slice. */
export async function recipeTestFiles(): Promise<string[]> {
  const files: string[] = [];
  for await (const file of new Bun.Glob('recipes/**/*.test.ts').scan({ onlyFiles: true }))
    files.push(file);
  return files.sort();
}

/** Keep ordinary tests on shard one and round-robin recipe tests across every shard. */
export function testTargets(recipeTests: readonly string[], shard: Shard | undefined): string[] {
  const selectedRecipes = inShard(recipeTests, shard);
  return !shard || shard.k === 1 ? [...STANDARD_TEST_ROOTS, ...selectedRecipes] : selectedRecipes;
}

if (import.meta.main) {
  const targets = testTargets(await recipeTestFiles(), parseShard(process.env['T3D_SHARD']));
  const result = Bun.spawnSync(['bun', 'test', '--timeout', '120000', ...targets], {
    stdout: 'inherit',
    stderr: 'inherit',
  });
  process.exit(result.exitCode ?? 1);
}
