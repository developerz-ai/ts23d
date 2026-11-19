import { describe, expect, it } from 'bun:test';
import { costsFromRun, parseShardLog } from './recipe-costs-run.ts';

/** A gate job's log as GitHub serves it, cut down: shard `k` of 2 with the given lines. */
const log = (k: number, verify: string, lines: readonly string[]): string =>
  [
    `$ bun test --timeout 120000 src scripts "--shard=${k}/2" "--timings=scripts/lib/test-timings.json"`,
    `--shard=${k}/2: running 2/4 test files`,
    ...lines,
    `\u001b[32m✔ verify: ${verify}\u001b[0m`,
  ]
    .map((l, i) => `2026-11-19T09:00:${String(i).padStart(2, '0')}.0000000Z ${l}`)
    .join('\n');

const LOG1 = log(1, 'lint 4000ms · test 3000ms · recipes 30000ms · pack 16000ms', [
  '##[group]src/a.test.ts:',
  '(pass) a > one [400.00ms]',
  '(pass) a > two [600.00ms]',
  '##[endgroup]',
  '##[group]src/b.test.ts:',
  '(pass) b > one [1000.00ms]',
  '##[endgroup]',
  ' 3 pass',
  'Ran 3 tests across 2 files. [3.00s]',
  '##[group]recipes/a/a.test.ts:',
  '(pass) a > builds [5000.00ms]',
  '##[endgroup]',
  '✔ recipes (2 assets, 1 test files)',
  '  → recipes/b/.out-tmp/b/sheet.png',
  '✔ recipes/b 40.5s',
]);
const LOG2 = log(2, 'test 2000ms · recipes 10000ms', [
  '##[group]src/c.test.ts:',
  '(pass) c > one [1000.00ms]',
  '##[endgroup]',
  '✔ recipes (1 assets, 0 test files)',
  '✔ recipes/a 20s',
]);

describe('costs from a CI run', () => {
  const before = {
    shard1: 1,
    seconds: { 'gate:recipes/a': 30, 'gate:recipes/b': 9, 'recipes/_lib/x.test.ts': 10 },
  };
  const unitsOf = ({ k }: { k: number }): string[] =>
    k === 1
      ? ['gate:recipes/a', 'recipes/_lib/x.test.ts', 'shots:recipes/b']
      : ['gate:recipes/b', 'shots:recipes/a'];
  const runs = [
    { ...parseShardLog(LOG1), job: 105.5 },
    { ...parseShardLog(LOG2), job: 44 },
  ];

  it('refuses a log that is not a green gate job', () => {
    expect(() => parseShardLog('##[group]Run bun run verify\n✗ verify failed')).toThrow(/fix:/);
  });

  it('reads the shard, the steps, the renders and the test files, not the recipe tests', () => {
    expect(parseShardLog(LOG1)).toEqual({
      k: 1,
      n: 2,
      steps: { lint: 4000, test: 3000, recipes: 30000, pack: 16000 },
      shots: { 'recipes/b': 40.5 },
      tests: { 'src/a.test.ts': 1000, 'src/b.test.ts': 1000 },
    });
  });

  it('refuses a missing shard and a run whose renders are not today’s split', () => {
    expect(() => costsFromRun(runs.slice(0, 1), before, unitsOf)).toThrow(/each gate shard/);
    const moved = (s: { k: number }): string[] => unitsOf({ k: 3 - s.k });
    expect(() => costsFromRun(runs, before, moved)).toThrow(/commit the run built/);
  });

  it('takes renders as logged, splits the recipes step by the old costs, scales tests to the step', () => {
    expect(costsFromRun(runs, before, unitsOf)).toEqual({
      shard1: 20, // lint + pack
      overhead: 12, // (105.5 − 53 − 40.5 + 44 − 12 − 20) / 2
      seconds: {
        'gate:recipes/a': 22.5, // 30 s of recipes step × 30 / (30 + 10)
        'gate:recipes/b': 10,
        'recipes/_lib/x.test.ts': 7.5,
        'shots:recipes/a': 20,
        'shots:recipes/b': 40.5,
      },
      // 2 s of tests' own time in a 3 s step; one file in a 2 s step.
      tests: { 'src/a.test.ts': 1500, 'src/b.test.ts': 1500, 'src/c.test.ts': 2000 },
    });
  });
});
