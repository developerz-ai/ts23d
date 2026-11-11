// THE gate. `bun run verify` locally ≡ the `verify` job in CI — one step list, so green here
// means green there (scripts/ci-parity.test.ts holds the two together).
//   bun run verify                 every step, stops on the first red
//   bun run verify --only a,b      a subset (the inner loop); --json for agents
//   T3D_SHARD=k/n bun run verify   CI's parallel split: shard 1 runs every step; every shard runs
//                                  `test` and `recipes` on its recipe-test and recipe slices

import { parseShard } from './lib/shard.ts';

export const STEPS = [
  { name: 'lint', cmd: ['bunx', 'biome', 'check', '.'] },
  { name: 'typecheck', cmd: ['bun', 'run', 'typecheck'] },
  { name: 'boundaries', cmd: ['bun', 'run', 'scripts/boundaries.ts'] },
  { name: 'determinism', cmd: ['bun', 'run', 'scripts/determinism.ts'] },
  { name: 'filesize', cmd: ['bun', 'run', 'scripts/filesize.ts'] },
  // The args, and the one per-test timeout, live in package.json's `test` script.
  { name: 'test', cmd: ['bun', 'run', 'test'] },
  { name: 'recipes', cmd: ['bun', 'run', 'scripts/recipes.ts'] },
  { name: 'build', cmd: ['bun', 'run', 'scripts/build.ts'] },
] as const;

export type StepName = (typeof STEPS)[number]['name'];

/** Retain global checks on shard one while distributing recipe work to every shard. */
export function stepsFor(shard: ReturnType<typeof parseShard>, only?: readonly string[]) {
  const requested = only ? STEPS.filter((step) => only.includes(step.name)) : STEPS;
  return requested.filter(
    (step) => !shard || shard.k === 1 || step.name === 'test' || step.name === 'recipes',
  );
}

if (import.meta.main) {
  const json = process.argv.includes('--json');
  const only = process.argv[process.argv.indexOf('--only') + 1]?.split(',');
  const shard = parseShard(process.env['T3D_SHARD']);
  const steps = stepsFor(shard, process.argv.includes('--only') ? only : undefined);
  const results: { step: string; ok: boolean; ms: number }[] = [];
  for (const step of steps) {
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
