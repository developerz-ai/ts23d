// THE gate. `bun run verify` locally ≡ the `gate` job in CI — one step list, so green here
// means green there (scripts/ci-parity.test.ts holds the two together).
//   bun run verify                 every step, stops on the first red
//   bun run verify --only a,b      a subset (the inner loop); --json for agents. A name that is not
//                                  a step, or --only with no names, exits 2: a typo never goes green
//   T3D_SHARD=k/n bun run verify   CI's parallel split: shard 1 runs every step on its slice of the
//                                  recipes; shards 2..n run only `recipes` on theirs

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
  if (shard && shard.k !== 1) steps = steps.filter((s) => s.name === 'recipes');
  if (steps.length === 0)
    return {
      error: `nothing to run on shard ${shard?.k}/${shard?.n}: shards 2..n run only 'recipes'. fix: unset T3D_SHARD, or add recipes to --only`,
    };
  return { steps };
}

if (import.meta.main) {
  const json = process.argv.includes('--json');
  const picked = selectSteps(process.argv.slice(2), parseShard(process.env['T3D_SHARD']));
  if ('error' in picked) {
    if (json) console.log(JSON.stringify({ ok: false, error: picked.error }));
    else console.error(`✗ verify: ${picked.error}`);
    process.exit(2);
  }
  const results: { step: string; ok: boolean; ms: number }[] = [];
  for (const step of picked.steps) {
    const t0 = Bun.nanoseconds();
    const p = Bun.spawnSync([...step.cmd], {
      stdout: json ? 'pipe' : 'inherit',
      stderr: json ? 'pipe' : 'inherit',
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
      process.exit(1);
    }
  }
  if (json) console.log(JSON.stringify({ ok: true, results }));
  else console.log(`\n✔ verify: ${results.map((r) => `${r.step} ${r.ms}ms`).join(' · ')}`);
}
