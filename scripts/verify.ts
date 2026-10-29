// THE gate. `bun run verify` locally ≡ the `verify` job in CI — one step list, so green here
// means green there (scripts/ci-parity.test.ts holds the two together).
//   bun run verify                 every step, stops on the first red
//   bun run verify --only a,b      a subset (the inner loop); --json for agents

export const STEPS = [
  { name: 'lint', cmd: ['bunx', 'biome', 'check', '.'] },
  { name: 'typecheck', cmd: ['bun', 'run', 'typecheck'] },
  { name: 'boundaries', cmd: ['bun', 'run', 'scripts/boundaries.ts'] },
  { name: 'determinism', cmd: ['bun', 'run', 'scripts/determinism.ts'] },
  { name: 'filesize', cmd: ['bun', 'run', 'scripts/filesize.ts'] },
  { name: 'test', cmd: ['bun', 'test', 'src', 'scripts', 'examples'] },
  { name: 'recipes', cmd: ['bun', 'run', 'scripts/recipes.ts'] },
  { name: 'build', cmd: ['bun', 'run', 'scripts/build.ts'] },
] as const;

export type StepName = (typeof STEPS)[number]['name'];

if (import.meta.main) {
  const json = process.argv.includes('--json');
  const only = process.argv[process.argv.indexOf('--only') + 1]?.split(',');
  const steps = process.argv.includes('--only')
    ? STEPS.filter((s) => only?.includes(s.name))
    : STEPS;
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
