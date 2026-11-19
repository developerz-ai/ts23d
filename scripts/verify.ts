// THE gate. `bun run verify` locally ≡ the `gate` job in CI — one step list, so green here
// means green there (scripts/ci-parity.test.ts holds the two together).
//   bun run verify                 every step, stops on the first red
//   bun run verify --only a,b      a subset (the inner loop); --json for agents. A name that is not
//                                  a step, or --only with no names, exits 2: a typo never goes green
//   T3D_SHARD=k/n bun run verify   CI's parallel split: every shard runs `test` (bun test --shard,
//                                  balanced by scripts/lib/test-timings.json) and `recipes` on its
//                                  slice (scripts/lib/shard.ts); shard 1 also runs every other step
//   T3D_DOCS_ONLY=1                CI's `changes` job found only docs outside recipes/
//                                  (scripts/ci-changes.ts): no recipe input moved, `recipes` is skipped

import { loadConfig, withQueue } from '../src/cli/queue/index.ts';
import { isTs23dError } from '../src/core/index.ts';
import { parseShard, type Shard } from './lib/shard.ts';

export const STEPS = [
  { name: 'lint', cmd: ['bunx', 'biome', 'check', '.'] },
  { name: 'typecheck', cmd: ['bun', 'run', 'typecheck'] },
  { name: 'boundaries', cmd: ['bun', 'run', 'scripts/boundaries.ts'] },
  { name: 'determinism', cmd: ['bun', 'run', 'scripts/determinism.ts'] },
  { name: 'filesize', cmd: ['bun', 'run', 'scripts/filesize.ts'] },
  { name: 'placeholders', cmd: ['bun', 'run', 'scripts/placeholders.ts'] },
  { name: 'conventions', cmd: ['bun', 'run', 'scripts/conventions.ts'] },
  // The args, and the one per-test timeout, live in package.json's `test` script.
  { name: 'test', cmd: ['bun', 'run', 'test'] },
  // Also runs the recipe folders' own *.test.ts for this shard (see scripts/recipes.ts).
  { name: 'recipes', cmd: ['bun', 'run', 'scripts/recipes.ts'] },
  { name: 'build', cmd: ['bun', 'run', 'scripts/build.ts'] },
  { name: 'pack', cmd: ['bun', 'run', 'scripts/pack-smoke.ts'] },
] as const;

export type Step = (typeof STEPS)[number];
export type StepName = Step['name'];

/** The steps to run, or a usage error naming the valid steps. Never an empty list. */
export function selectSteps(
  argv: readonly string[],
  shard: Shard | undefined,
  docsOnly = false,
): { steps: Step[] } | { error: string } {
  const valid = STEPS.map((s) => s.name).join(',');
  let steps: Step[] = [...STEPS];
  const at = argv.indexOf('--only');
  if (at !== -1) {
    const raw = argv[at + 1];
    if (raw === undefined || raw.startsWith('--'))
      return {
        error: `--only needs step names. fix: bun run verify --only lint (steps: ${valid})`,
      };
    const names = raw.split(',');
    const unknown = names.filter((n) => !STEPS.some((s) => s.name === n));
    if (unknown.length > 0)
      return {
        error: `unknown step(s) ${unknown.map((n) => `'${n}'`).join(', ')}. fix: pick from ${valid}`,
      };
    steps = STEPS.filter((s) => names.includes(s.name));
  }
  if (shard && shard.k !== 1) steps = steps.filter((s) => SHARDED.includes(s.name));
  if (docsOnly) steps = steps.filter((s) => s.name !== 'recipes');
  if (steps.length === 0)
    return {
      error: `nothing to run on shard ${shard?.k}/${shard?.n}: shards 2..n run only ${SHARDED.join(' and ')}. fix: unset T3D_SHARD, or add test or recipes to --only`,
    };
  return { steps };
}

/** The steps every shard runs on its own slice; the rest run once, on shard 1. */
export const SHARDED: readonly StepName[] = ['test', 'recipes'];

/** Per-file durations `bun test --shard` balances by (refresh: bun run scripts/recipe-costs.ts --tests). */
export const TEST_TIMINGS = 'scripts/lib/test-timings.json';

/** The command a step runs on this shard: `test` takes its slice of the test files. */
export function commandOf(step: Step, shard: Shard | undefined): string[] {
  if (step.name !== 'test' || !shard) return [...step.cmd];
  return [...step.cmd, `--shard=${shard.k}/${shard.n}`, `--timings=${TEST_TIMINGS}`];
}

if (import.meta.main) {
  const json = process.argv.includes('--json');
  const shard = parseShard(process.env['T3D_SHARD']);
  const picked = selectSteps(process.argv.slice(2), shard, process.env['T3D_DOCS_ONLY'] === '1');
  if ('error' in picked) {
    if (json) console.log(JSON.stringify({ ok: false, error: picked.error }));
    else console.error(`✗ verify: ${picked.error}`);
    process.exit(2);
  }
  // One place in the machine's queue for the whole gate (off in CI): several agents' gates take
  // turns instead of oversubscribing the cores. Steps inherit the grant through the environment.
  let code = 1;
  try {
    const { weights } = await loadConfig(process.env);
    code = await withQueue('cpu', weights.verify, async () => runSteps(picked.steps), {
      cmd: 'bun run verify',
    });
  } catch (e) {
    // A full queue under T3D_QUEUE=fail, a wait past its limit, a bad queue.json.
    const fix = isTs23dError(e) && e.fix ? ` fix: ${e.fix}` : '';
    const error = `${e instanceof Error ? e.message : String(e)}${fix}`;
    if (json) console.log(JSON.stringify({ ok: false, error }));
    else console.error(`✗ verify: ${error}`);
  }
  process.exit(code);

  /** Runs the steps in order; the exit code (0, or 1 at the first failing step). */
  function runSteps(steps: readonly Step[]): number {
    const results: { step: string; ok: boolean; ms: number }[] = [];
    for (const step of steps) {
      const t0 = Bun.nanoseconds();
      const p = Bun.spawnSync(commandOf(step, shard), {
        stdout: json ? 'pipe' : 'inherit',
        stderr: json ? 'pipe' : 'inherit',
        env: process.env, // explicit: the queue grant was added after start-up
      });
      const ok = p.exitCode === 0;
      results.push({ step: step.name, ok, ms: Math.round((Bun.nanoseconds() - t0) / 1e6) });
      if (!ok) {
        if (json)
          console.log(
            JSON.stringify({
              ok: false,
              failed: step.name,
              results,
              output: `${p.stdout}${p.stderr}`.slice(-4000),
            }),
          );
        else
          console.error(
            `\n✗ verify failed at '${step.name}'. Re-run just it: bun run verify --only ${step.name}`,
          );
        return 1;
      }
    }
    if (json) console.log(JSON.stringify({ ok: true, results }));
    else console.log(`\n✔ verify: ${results.map((r) => `${r.step} ${r.ms}ms`).join(' · ')}`);
    return 0;
  }
}
