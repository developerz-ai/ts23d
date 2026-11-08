// CI splits the slow per-recipe work across parallel jobs: T3D_SHARD=k/n (1-based) keeps every
// n-th recipe folder starting at k. Unset = everything, so `bun run verify` locally is the whole gate.

export interface Shard {
  readonly k: number;
  readonly n: number;
}

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

/** The items this shard owns (round-robin over the sorted list), or all of them. */
export function inShard<T>(items: readonly T[], shard: Shard | undefined): T[] {
  return shard ? items.filter((_, i) => i % shard.n === shard.k - 1) : [...items];
}

export const CURRENT_SHARD = parseShard(process.env['T3D_SHARD']);
