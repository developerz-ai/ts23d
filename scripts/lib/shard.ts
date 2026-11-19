// CI splits the slow per-recipe work across parallel jobs: T3D_SHARD=k/n (1-based) owns one of n
// slices. Unset = everything, so `bun run verify` locally is the whole gate. The slices are
// balanced by measured cost (recipe-costs.json: the GitHub seconds each folder's gate, each folder's
// renders and each shared recipe test add to a CI shard job; refresh from a green run with
// `bun run scripts/recipe-costs.ts --from-run <id>`): greedy, longest first, into the least-loaded
// shard, with shard 1 preloaded by the once-only checks it also runs.
// Deterministic: the same keys and costs give the same split on every runner.

import costsJson from './recipe-costs.json' with { type: 'json' };

export interface Shard {
  readonly k: number;
  readonly n: number;
}

/** Measured seconds per unit (`gate:recipes/<name>`, `shots:recipes/<name>` or a shared test file). */
export interface Costs {
  /** Seconds shard 1 spends on the steps only it runs (lint, typecheck, build, pack…). */
  readonly shard1: number;
  /** Seconds every job spends outside its units: checkout, setup, what changed, the stale check. */
  readonly overhead?: number;
  readonly seconds: Readonly<Record<string, number>>;
}

export const COSTS: Costs = costsJson;

/** CI's shard count (.github/workflows/ci.yml's gate matrix; scripts/ci-parity.test.ts holds them together). */
export const CI_SHARDS = 18;

/** Parse `k/n`; undefined when unset, a thrown message (with the fix) when malformed. */
export function parseShard(raw: string | undefined): Shard | undefined {
  if (raw === undefined || raw === '') return undefined;
  const m = /^(\d+)\/(\d+)$/.exec(raw);
  const k = Number(m?.[1]);
  const n = Number(m?.[2]);
  if (!m || n < 1 || k < 1 || k > n)
    throw new Error(`T3D_SHARD='${raw}' is not k/n with 1 ≤ k ≤ n — fix: T3D_SHARD=1/4`);
  return { k, n };
}

/** The cost of a unit with no measurement yet: the median measured cost (0 when none). */
export function defaultCost(costs: Costs): number {
  const all = Object.values(costs.seconds).sort((a, b) => a - b);
  if (all.length === 0) return 0;
  const mid = all.length >> 1;
  return all.length % 2 ? (all[mid] ?? 0) : ((all[mid - 1] ?? 0) + (all[mid] ?? 0)) / 2;
}

/** The 0-based shard of every key, longest first into the least-loaded shard (ties: lowest). */
export function balance(keys: readonly string[], n: number, costs: Costs): Map<string, number> {
  const fallback = defaultCost(costs);
  const cost = (key: string): number => costs.seconds[key] ?? fallback;
  const order = [...new Set(keys)].sort((a, b) => cost(b) - cost(a) || (a < b ? -1 : 1));
  const load = Array.from({ length: n }, (_, i) => (i === 0 && n > 1 ? costs.shard1 : 0));
  const at = new Map<string, number>();
  for (const key of order) {
    let best = 0;
    for (let i = 1; i < n; i++) if ((load[i] ?? 0) < (load[best] ?? 0)) best = i;
    at.set(key, best);
    load[best] = (load[best] ?? 0) + cost(key);
  }
  return at;
}

/** Predicted seconds per shard (index 0 = shard 1) for these keys. */
export function shardLoads(keys: readonly string[], n: number, costs: Costs = COSTS): number[] {
  const fallback = defaultCost(costs);
  const load = Array.from({ length: n }, (_, i) => (i === 0 && n > 1 ? costs.shard1 : 0));
  for (const [key, i] of balance(keys, n, costs))
    load[i] = (load[i] ?? 0) + (costs.seconds[key] ?? fallback);
  return load;
}

/** The items this shard owns (balanced by `keyOf`'s measured cost), or all of them, in order. */
export function inShard<T>(
  items: readonly T[],
  shard: Shard | undefined,
  keyOf: (item: T) => string,
  costs: Costs = COSTS,
): T[] {
  if (!shard) return [...items];
  const at = balance(items.map(keyOf), shard.n, costs);
  return items.filter((item) => at.get(keyOf(item)) === shard.k - 1);
}

/** The cost key of a folder's recipes-gate work (`gate:recipes/t34`) or its renders (`shots:…`). */
export const gateKey = (dir: string): string => `gate:${dir}`;
export const shotsKey = (dir: string): string => `shots:${dir}`;

/**
 * A shard's recipe work: the folders it gates (`recipes`), the folders it renders (`shots`) and its
 * share of the shared `recipes/_*` test files. A folder's gate and renders are separate units, so
 * the two heaviest halves of one head recipe can run on different shards; every runner computes
 * the same split, so `recipes` and `shots` together cover every folder exactly once each.
 */
export function recipeShard<F extends { readonly dir: string }>(
  folders: readonly F[],
  sharedTests: readonly string[],
  shard: Shard | undefined,
  costs: Costs = COSTS,
): { gate: F[]; shots: F[]; sharedTests: string[] } {
  const units = [
    ...folders.map((f) => gateKey(f.dir)),
    ...folders.map((f) => shotsKey(f.dir)),
    ...sharedTests,
  ];
  const mine = new Set(inShard(units, shard, (u) => u, costs));
  return {
    gate: folders.filter((f) => mine.has(gateKey(f.dir))),
    shots: folders.filter((f) => mine.has(shotsKey(f.dir))),
    sharedTests: sharedTests.filter((t) => mine.has(t)),
  };
}

export const CURRENT_SHARD = parseShard(process.env['T3D_SHARD']);
