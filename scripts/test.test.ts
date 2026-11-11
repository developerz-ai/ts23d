// Guards test-target selection so every recipe test stays in the local and CI gate.

import { describe, expect, it } from 'bun:test';
import { parseShard } from './lib/shard.ts';
import { recipeTestFiles, STANDARD_TEST_ROOTS, testTargets } from './test.ts';

describe('test launcher', () => {
  it('includes every recipe test in an unsharded local run', async () => {
    const recipeTests = await recipeTestFiles();
    expect(recipeTests).not.toHaveLength(0);
    expect(testTargets(recipeTests, undefined)).toEqual([...STANDARD_TEST_ROOTS, ...recipeTests]);
  });

  it('partitions recipe tests without overlap while keeping standard tests on shard one', async () => {
    const recipeTests = await recipeTestFiles();
    const shards = Array.from({ length: 12 }, (_, index) =>
      testTargets(recipeTests, parseShard(`${index + 1}/12`)),
    );
    expect(shards[0]?.slice(0, STANDARD_TEST_ROOTS.length)).toEqual(STANDARD_TEST_ROOTS);
    expect(shards.slice(1).flat()).not.toEqual(expect.arrayContaining([...STANDARD_TEST_ROOTS]));
    expect(shards.flat().filter((file) => recipeTests.includes(file)).sort()).toEqual(recipeTests);
  });
});
