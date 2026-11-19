// Measure what each unit of sharded CI work costs and write scripts/lib/recipe-costs.json, which
// scripts/lib/shard.ts balances T3D_SHARD by. Sequential and wall-clock, so run it on a quiet box.
//   bun run scripts/recipe-costs.ts            every recipe folder's gate and, separately, its
//                                              renders (`bun run shots`, which rewrites out/),
//                                              every shared recipes/_*/ test and shard 1's checks
//   bun run scripts/recipe-costs.ts t34 wolf   only these folders, merged into the file
//   bun run scripts/recipe-costs.ts --tests    also refresh scripts/lib/test-timings.json, which
//                                              balances the sharded `test` step (bun test --shard)
//   bun run scripts/recipe-costs.ts --plan     measure nothing: print the predicted seconds per
//                                              shard for 4..20 shards from the committed files
// Seconds are this machine's; only their ratios matter for balance. Exit 1 when a measured command
// failed (its time is still recorded: a red recipe costs what it costs).

import { recipeFolders, tsFiles } from './lib/files.ts';
import { CI_SHARDS, COSTS, type Costs, gateKey, shardLoads, shotsKey } from './lib/shard.ts';
import { sharedRecipeTests } from './recipes.ts';
import { SHARDED, STEPS, TEST_TIMINGS as TEST_TIMINGS_FILE } from './verify.ts';

export const COSTS_FILE = 'scripts/lib/recipe-costs.json';

/** The steps only shard 1 runs: every gate step except the sharded `test` and `recipes`. */
export const SHARD1_STEPS: readonly string[] = STEPS.map((s) => s.name).filter(
  (n) => !SHARDED.includes(n),
);

/**
 * New measurements over old ones. A full run (`all` = every current unit) also drops units that
 * no longer exist; a partial run keeps everything it did not measure. Keys sorted, 0.1 s.
 */
export function mergeCosts(
  old: Costs,
  measured: Readonly<Record<string, number>>,
  shard1: number | undefined,
  all?: readonly string[],
): Costs {
  const merged: Record<string, number> = { ...old.seconds, ...measured };
  const keep = all ? new Set(all) : undefined;
  const seconds: Record<string, number> = {};
  for (const k of Object.keys(merged).sort())
    if (!keep || keep.has(k)) seconds[k] = Math.round((merged[k] ?? 0) * 10) / 10;
  return { shard1: Math.round((shard1 ?? old.shard1) * 10) / 10, seconds };
}

/** Predicted seconds per shard: its recipe units (+ shard 1's checks) and 1/n of the tests. */
export function plan(
  costs: Costs,
  units: readonly string[],
  testSeconds: number,
  n: number,
): number[] {
  return shardLoads(units, n, costs).map((s) => s + testSeconds / n);
}

async function printPlan(units: readonly string[]): Promise<void> {
  const t = (await Bun.file(TEST_TIMINGS_FILE).json()) as { files: Record<string, number> };
  const tests = Object.values(t.files).reduce((a, b) => a + b, 0) / 1000;
  for (let n = 4; n <= 20; n++) {
    const loads = plan(COSTS, units, tests, n);
    const max = Math.max(...loads);
    const sum = loads.reduce((a, b) => a + b, 0);
    console.log(
      `${n === CI_SHARDS ? '→' : ' '} ${String(n).padStart(2)} shards: max ${max.toFixed(0)}s · mean ${(sum / n).toFixed(0)}s · total ${sum.toFixed(0)}s · ${loads.map((l) => l.toFixed(0)).join(' ')}`,
    );
  }
}

/** Run a command with T3D_SHARD unset; its wall seconds and whether it exited 0. */
function timed(cmd: readonly string[]): { s: number; ok: boolean } {
  const env = { ...process.env };
  delete env['T3D_SHARD'];
  const t0 = Bun.nanoseconds();
  const p = Bun.spawnSync([...cmd], { stdout: 'ignore', stderr: 'inherit', env });
  const s = (Bun.nanoseconds() - t0) / 1e9;
  console.log(`${p.exitCode === 0 ? '✔' : '✘'} ${s.toFixed(1).padStart(7)}s  ${cmd.join(' ')}`);
  return { s, ok: p.exitCode === 0 };
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const names = args.filter((a) => !a.startsWith('--'));
  const { folders } = await recipeFolders();
  const shared = sharedRecipeTests(await tsFiles('recipes'));
  const unknown = names.filter((n) => !folders.some((f) => f.dir === `recipes/${n}`));
  if (unknown.length) {
    console.error(`✗ no recipe folder ${unknown.join(', ')}. fix: pick names from \`ls recipes\``);
    return 2;
  }
  const units = [
    ...folders.map((f) => gateKey(f.dir)),
    ...folders.map((f) => shotsKey(f.dir)),
    ...shared,
  ];
  if (args.includes('--plan')) {
    await printPlan(units);
    return 0;
  }
  const picked = names.length
    ? folders.filter((f) => names.some((n) => f.dir === `recipes/${n}`))
    : folders;
  const measured: Record<string, number> = {};
  let failed = 0;
  for (const { dir } of picked) {
    const name = dir.slice('recipes/'.length);
    const gate = timed(['bun', 'run', 'scripts/recipes.ts', name]);
    const shots = timed(['bun', 'run', 'scripts/shots.ts', name]);
    measured[gateKey(dir)] = gate.s;
    measured[shotsKey(dir)] = shots.s;
    failed += Number(!gate.ok) + Number(!shots.ok);
  }
  let shard1: number | undefined;
  if (!names.length) {
    for (const t of shared) {
      const r = timed(['bun', 'test', '--timeout', '120000', `./${t}`]);
      measured[t] = r.s;
      failed += Number(!r.ok);
    }
    const r = timed(['bun', 'run', 'scripts/verify.ts', '--only', SHARD1_STEPS.join(',')]);
    shard1 = r.s;
    failed += Number(!r.ok);
  }
  const file = Bun.file(COSTS_FILE);
  const old: Costs = (await file.exists()) ? await file.json() : { shard1: 0, seconds: {} };
  const all = names.length ? undefined : units;
  await Bun.write(
    COSTS_FILE,
    `${JSON.stringify(mergeCosts(old, measured, shard1, all), null, 2)}\n`,
  );
  console.log(`→ ${COSTS_FILE}`);
  if (args.includes('--tests')) {
    if (!(await Bun.file(TEST_TIMINGS_FILE).exists()))
      await Bun.write(TEST_TIMINGS_FILE, '{ "version": 1, "files": {} }\n');
    const r = timed(['bun', 'run', 'test', `--timings=${TEST_TIMINGS_FILE}`, '--update-timings']);
    failed += Number(!r.ok);
    console.log(`→ ${TEST_TIMINGS_FILE}`);
  }
  if (failed) console.error(`✗ ${failed} measured command(s) failed (times recorded anyway)`);
  return failed ? 1 : 0;
}

if (import.meta.main) process.exitCode = await main();
