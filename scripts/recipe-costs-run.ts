// What one green `ci` run measured, as costs for scripts/lib/recipe-costs.json and
// scripts/lib/test-timings.json (`bun run scripts/recipe-costs.ts --from-run <id>` writes them).
// Per gate shard:
//   measured  a folder's renders (`✔ recipes/<name> 21.1s`, scripts/shots.ts); the shard's `test`
//             and `recipes` steps and shard 1's own steps (`✔ verify: test 123ms · …`,
//             scripts/verify.ts); the job's wall seconds (the jobs API)
//   derived   a folder's gate and a shared recipe test: the shard's `recipes` step seconds, split
//             between its units in proportion to their previous costs (that step prints no time
//             per folder, and its output arrives in one piece, so timestamps say nothing);
//             a test file: the sum of its tests' `[ms]`, scaled to the shard's `test` step;
//             `overhead`: the job's wall seconds minus its steps and renders (runner set-up,
//             checkout, bun install, what changed, the stale check), averaged over the shards
// The split a run used is not in its log: it is recomputed from the committed costs, so ingest a
// run on the commit it built, before the costs change. A mismatch with the logged renders throws.

import { type Costs, defaultCost, type Shard, shotsKey } from './lib/shard.ts';
import { SHARDED } from './verify.ts';

/** What one gate job's log says: verify's steps (ms), renders (s per folder), tests (ms per file). */
export interface ShardLog extends Shard {
  readonly steps: Readonly<Record<string, number>>;
  readonly shots: Readonly<Record<string, number>>;
  readonly tests: Readonly<Record<string, number>>;
}

/** A gate job: its log and its wall seconds. */
export interface ShardRun extends ShardLog {
  readonly job: number;
}

/** A run's costs: seconds per unit, shard 1's own steps, the per-job overhead, ms per test file. */
export interface RunCosts {
  readonly seconds: Record<string, number>;
  readonly shard1: number;
  readonly overhead: number;
  readonly tests: Record<string, number>;
}

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

/** Read one gate job's log (a timestamp and colour codes may precede every line). */
export function parseShardLog(log: string): ShardLog {
  const shard = /--shard=(\d+)\/(\d+)/.exec(log);
  const verify = /✔ verify: (.+)/.exec(log);
  if (!shard || !verify)
    throw new Error('no `--shard=k/n` and `✔ verify:` line. fix: pass a green gate job’s log');
  const steps: Record<string, number> = {};
  for (const m of (verify[1] ?? '').matchAll(/(\S+) (\d+)ms/g)) steps[m[1] ?? ''] = Number(m[2]);
  const shots: Record<string, number> = {};
  for (const m of log.matchAll(/✔ (recipes\/\S+) ([\d.]+)s\s*$/gm))
    shots[m[1] ?? ''] = Number(m[2]);
  const tests: Record<string, number> = {};
  let file: string | undefined;
  for (const line of log.split('\n')) {
    const group = /##\[group\](\S+\.test\.tsx?):/.exec(line);
    // The recipes step runs the tests under recipes/: they are part of that step's cost.
    if (group) file = group[1]?.startsWith('recipes/') ? undefined : group[1];
    const ms = /\[([\d.]+)ms\]\s*$/.exec(line);
    if (file && (group || ms)) tests[file] = (tests[file] ?? 0) + Number(ms?.[1] ?? 0);
  }
  return { k: Number(shard[1]), n: Number(shard[2]), steps, shots, tests };
}

/**
 * The costs a run measured (the header says which are measured and which derived). `unitsOf` is
 * the split the run used: today's, so each shard's logged renders must be the ones it gives it.
 */
export function costsFromRun(
  runs: readonly ShardRun[],
  old: Costs,
  unitsOf: (shard: Shard) => readonly string[],
): RunCosts {
  const n = runs[0]?.n ?? 0;
  if (n === 0 || runs.length !== n || new Set(runs.map((r) => (r.n === n ? r.k : 0))).size !== n)
    throw new Error(`need each gate shard's log once, got ${runs.length}. fix: pass a green run`);
  const seconds: Record<string, number> = {};
  const tests: Record<string, number> = {};
  let shard1 = 0;
  let overhead = 0;
  for (const r of runs) {
    const units = unitsOf(r);
    const gated = units.filter((u) => !u.startsWith(shotsKey('')));
    const rendered = units.filter((u) => u.startsWith(shotsKey(''))).sort();
    const recipes = r.steps['recipes'];
    const logged = Object.keys(r.shots).map(shotsKey).sort();
    if (recipes === undefined || logged.join() !== rendered.join())
      throw new Error(
        `shard ${r.k}/${n} did not gate and render the units today's costs give it. fix: check out the commit the run built; a docs-only run measures nothing`,
      );
    for (const [dir, s] of Object.entries(r.shots)) seconds[shotsKey(dir)] = s;
    // A unit with no cost yet (or 0) still gets a share.
    const weight = (u: string): number => Math.max(old.seconds[u] ?? defaultCost(old), 0.1);
    const weights = sum(gated.map(weight));
    for (const u of gated) seconds[u] = (recipes / 1000) * (weight(u) / weights);
    const testMs = sum(Object.values(r.tests));
    for (const [f, ms] of Object.entries(r.tests))
      tests[f] = Math.round(testMs > 0 ? (ms / testMs) * (r.steps['test'] ?? testMs) : 0);
    for (const [step, ms] of Object.entries(r.steps))
      if (r.k === 1 && !SHARDED.some((s) => s === step)) shard1 += ms / 1000;
    const work = sum(Object.values(r.steps)) / 1000 + sum(Object.values(r.shots));
    overhead += (r.job - work) / n;
  }
  return { seconds, shard1, overhead, tests };
}

/** `gh api` on this repository; throws with gh's own message when it fails. */
function gh(args: readonly string[]): string {
  const p = Bun.spawnSync(['gh', 'api', '--allow-escape-sequences', ...args], { stderr: 'pipe' });
  if (p.exitCode !== 0) throw new Error(`gh api ${args.join(' ')}: ${p.stderr} fix: gh auth login`);
  return p.stdout.toString();
}

/** Every gate job of a workflow run: its parsed log and its wall seconds. */
export function fetchRun(id: string): ShardRun[] {
  const jq =
    '.jobs[] | select(.name | startswith("gate")) | "\\(.id) \\(.started_at) \\(.completed_at)"';
  const rows = gh(['--paginate', `repos/{owner}/{repo}/actions/runs/${id}/jobs`, '--jq', jq]);
  return rows
    .trim()
    .split('\n')
    .filter((row) => row !== '')
    .map((row) => {
      const [job = '', start = '', end = ''] = row.split(' ');
      const log = gh([`repos/{owner}/{repo}/actions/jobs/${job}/logs`]);
      return { ...parseShardLog(log), job: (Date.parse(end) - Date.parse(start)) / 1000 };
    });
}
