// Record what each unit of sharded CI work costs, in GitHub seconds, in scripts/lib/recipe-costs.json
// (scripts/lib/shard.ts balances T3D_SHARD by it) and scripts/lib/test-timings.json (`bun test
// --shard` balances by it).
//   bun run scripts/recipe-costs.ts --from-run <id>  the calibration: read a green `ci` run's gate
//                                              logs (needs `gh`) and rewrite both files from what
//                                              GitHub measured. Run it on the commit the run built.
//   bun run scripts/recipe-costs.ts --plan     measure nothing: predicted seconds per job for
//                                              4..20 shards; → is CI_SHARDS, ★ the count to pick
//   bun run scripts/recipe-costs.ts t34 wolf   no run yet (new folders): time these folders' gate
//                                              and renders here and merge an estimate into the file
//   bun run scripts/recipe-costs.ts --renders  time only every folder's renders here, merged
//   bun run scripts/recipe-costs.ts            time everything here (sequential: use a quiet box)
//   bun run scripts/recipe-costs.ts --tests    also re-time every test file here
// `--from-run` is scripts/recipe-costs-run.ts, which says what it measures and what it derives.
// Times taken here are estimates of GitHub seconds: renders times CI_RENDER_FACTOR, gates as they
// are. Exit 1 when a measured command failed (its time is still recorded).

import { recipeFolders, tsFiles } from './lib/files.ts';
import {
  CI_SHARDS,
  COSTS,
  type Costs,
  gateKey,
  inShard,
  type Shard,
  shardLoads,
  shotsKey,
} from './lib/shard.ts';
import { costsFromRun, fetchRun, type RunCosts } from './recipe-costs-run.ts';
import { sharedRecipeTests } from './recipes.ts';
import { SHARDED, STEPS, TEST_TIMINGS as TEST_TIMINGS_FILE } from './verify.ts';

export const COSTS_FILE = 'scripts/lib/recipe-costs.json';

/**
 * A folder's renders on a 4-vCPU GitHub runner over the same renders on the 16-thread dev machine:
 * the median over the 55 folders of run 44492321426 (2026-11-19; they range 0.9 to 2.3, which is
 * why `--from-run` is the calibration). Gates ran at about this machine's speed there (0.95×).
 */
export const CI_RENDER_FACTOR = 1.5;

/** The slowest job `--plan` accepts (seconds, overhead included): push → green stays under 5 min. */
export const JOB_LIMIT = 240;
/** With the `site` job this is the 20 jobs a free account runs at once. */
export const MAX_SHARDS = 19;

/** The steps only shard 1 runs: every gate step except the sharded `test` and `recipes`. */
export const SHARD1_STEPS: readonly string[] = STEPS.map((s) => s.name).filter(
  (n) => !SHARDED.includes(n),
);

const round = (s: number): number => Math.round(s * 10) / 10;

/**
 * New measurements over old ones. A full run (`all` = every current unit) also drops units that
 * no longer exist; a partial run keeps everything it did not measure. Keys sorted, 0.1 s.
 */
export function mergeCosts(
  old: Costs,
  measured: Readonly<Record<string, number>>,
  shard1: number | undefined,
  all?: readonly string[],
  overhead: number | undefined = old.overhead,
): Costs {
  const merged: Record<string, number> = { ...old.seconds, ...measured };
  const keep = all ? new Set(all) : undefined;
  const seconds: Record<string, number> = {};
  for (const k of Object.keys(merged).sort())
    if (!keep || keep.has(k)) seconds[k] = round(merged[k] ?? 0);
  return {
    shard1: round(shard1 ?? old.shard1),
    ...(overhead === undefined ? {} : { overhead: round(overhead) }),
    seconds,
  };
}

/** Predicted seconds per job: overhead, its recipe units (+ shard 1's checks) and 1/n of the tests. */
export function plan(
  costs: Costs,
  units: readonly string[],
  testSeconds: number,
  n: number,
): number[] {
  return shardLoads(units, n, costs).map((s) => s + (costs.overhead ?? 0) + testSeconds / n);
}

/**
 * The slowest job when the heaviest recipe shard also draws the heaviest test slice: `bun test
 * --shard` splits on its own, and no slice is shorter than the longest test file.
 */
export function worstJob(loads: readonly number[], tests: readonly number[], n: number): number {
  const total = tests.reduce((a, b) => a + b, 0);
  return Math.max(...loads) - total / n + Math.max(total / n, ...tests);
}

/** The fewest shards (fewest runner-minutes: every job pays the overhead) whose worst job fits. */
export function pickShards(
  costs: Costs,
  units: readonly string[],
  tests: readonly number[],
  limit = JOB_LIMIT,
): number | undefined {
  const total = tests.reduce((a, b) => a + b, 0);
  for (let n = 1; n <= MAX_SHARDS; n++)
    if (worstJob(plan(costs, units, total, n), tests, n) <= limit) return n;
  return undefined;
}

async function printPlan(units: readonly string[]): Promise<void> {
  const t = (await Bun.file(TEST_TIMINGS_FILE).json()) as { files: Record<string, number> };
  const tests = Object.values(t.files).map((ms) => ms / 1000);
  const total = tests.reduce((a, b) => a + b, 0);
  const pick = pickShards(COSTS, units, tests);
  for (let n = 4; n <= 20; n++) {
    const loads = plan(COSTS, units, total, n);
    const sum = loads.reduce((a, b) => a + b, 0);
    const mark = `${n === CI_SHARDS ? '→' : ' '}${n === pick ? '★' : ' '}`;
    console.log(
      `${mark} ${String(n).padStart(2)} shards: max ${Math.max(...loads).toFixed(0)}s · worst ${worstJob(loads, tests, n).toFixed(0)}s · mean ${(sum / n).toFixed(0)}s · ${(sum / 60).toFixed(1)} runner-min · ${loads.map((l) => l.toFixed(0)).join(' ')}`,
    );
  }
  const [top] = units.map((u) => [COSTS.seconds[u] ?? 0, u] as const).sort((a, b) => b[0] - a[0]);
  console.log(
    `seconds per job, ${COSTS.overhead ?? 0}s overhead included; worst = the heaviest shard with the longest test slice (${Math.max(...tests).toFixed(0)}s); ★ = fewest shards ≤ ${MAX_SHARDS} with worst ≤ ${JOB_LIMIT}s${pick ? '' : ' (none)'}; largest unit: ${top?.[1]} ${top?.[0]}s`,
  );
}

async function fromRun(id: string, unitsOf: (shard: Shard) => readonly string[]): Promise<number> {
  if (!/^\d+$/.test(id)) {
    console.error('✗ --from-run needs a run id. fix: gh run list --workflow ci.yml -s success');
    return 2;
  }
  let run: RunCosts;
  try {
    run = costsFromRun(fetchRun(id), COSTS, unitsOf);
  } catch (e) {
    console.error(`✗ run ${id}: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  const costs = mergeCosts(COSTS, run.seconds, run.shard1, Object.keys(run.seconds), run.overhead);
  await Bun.write(COSTS_FILE, `${JSON.stringify(costs, null, 2)}\n`);
  const files = Object.fromEntries(
    Object.entries(run.tests).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)),
  );
  await Bun.write(TEST_TIMINGS_FILE, `${JSON.stringify({ version: 1, files }, null, 2)}\n`);
  console.log(`→ ${COSTS_FILE} (shard1 ${costs.shard1}s, overhead ${costs.overhead}s)`);
  console.log(`→ ${TEST_TIMINGS_FILE} (${Object.keys(files).length} files)`);
  return 0;
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
  const run = args.indexOf('--from-run');
  const names = args.filter((a, i) => !a.startsWith('--') && (run < 0 || i !== run + 1));
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
  if (run >= 0) return fromRun(args[run + 1] ?? '', (s) => inShard(units, s, (u) => u));
  if (args.includes('--plan')) {
    await printPlan(units);
    return 0;
  }
  const picked = names.length
    ? folders.filter((f) => names.some((n) => f.dir === `recipes/${n}`))
    : folders;
  const rendersOnly = args.includes('--renders');
  const measured: Record<string, number> = {};
  let failed = 0;
  for (const { dir } of picked) {
    const name = dir.slice('recipes/'.length);
    if (!rendersOnly) {
      const gate = timed(['bun', 'run', 'scripts/recipes.ts', name]);
      measured[gateKey(dir)] = gate.s;
      failed += Number(!gate.ok);
    }
    const shots = timed(['bun', 'run', 'scripts/shots.ts', name]);
    measured[shotsKey(dir)] = shots.s * CI_RENDER_FACTOR;
    failed += Number(!shots.ok);
  }
  const partial = names.length > 0 || rendersOnly;
  let shard1: number | undefined;
  if (!partial) {
    for (const t of shared) {
      const r = timed(['bun', 'test', '--timeout', '120000', `./${t}`]);
      measured[t] = r.s;
      failed += Number(!r.ok);
    }
    const r = timed(['bun', 'run', 'scripts/verify.ts', '--only', SHARD1_STEPS.join(',')]);
    shard1 = r.s;
    failed += Number(!r.ok);
  }
  const all = partial ? undefined : units;
  await Bun.write(
    COSTS_FILE,
    `${JSON.stringify(mergeCosts(COSTS, measured, shard1, all), null, 2)}\n`,
  );
  console.log(`→ ${COSTS_FILE}`);
  if (args.includes('--tests')) {
    const r = timed(['bun', 'run', 'test', `--timings=${TEST_TIMINGS_FILE}`, '--update-timings']);
    failed += Number(!r.ok);
    console.log(`→ ${TEST_TIMINGS_FILE}`);
  }
  if (failed) console.error(`✗ ${failed} measured command(s) failed (times recorded anyway)`);
  return failed ? 1 : 0;
}

if (import.meta.main) process.exitCode = await main();
