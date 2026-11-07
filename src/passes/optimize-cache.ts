// Post-transform vertex cache: Tom Forsyth's "Linear-Speed Vertex Cache Optimisation" (2006)
// triangle reorder, the vertex-fetch reorder that follows it, and the ACMR/ATVR analysis that
// measures both. All integer bookkeeping and fixed tie-breaks (lowest triangle index wins), so
// the output is byte-deterministic.

const CACHE = 32;
const DECAY = 1.5;
const LAST_TRI = 0.75;
const VALENCE_SCALE = 2;
const VALENCE_POWER = 0.5;
const MAX_VALENCE = 64;

const CACHE_SCORE = Float64Array.from({ length: CACHE }, (_, i) =>
  i < 3 ? LAST_TRI : (1 - (i - 3) / (CACHE - 3)) ** DECAY,
);
const VALENCE_SCORE = Float64Array.from({ length: MAX_VALENCE + 1 }, (_, n) =>
  n === 0 ? 0 : VALENCE_SCALE * n ** -VALENCE_POWER,
);

const vertexScore = (pos: number, live: number): number =>
  live === 0
    ? -1
    : (pos >= 0 ? (CACHE_SCORE[pos] ?? 0) : 0) + (VALENCE_SCORE[Math.min(live, MAX_VALENCE)] ?? 0);

/** Reorder triangles for an LRU cache of 32 (Forsyth). Returns a new index buffer. */
export function forsyth(indices: Uint32Array, vertexCount: number): Uint32Array {
  const triCount = indices.length / 3;
  if (triCount === 0) return new Uint32Array(0);
  // CSR adjacency: vertex → triangles; `live[v]` counts the not-yet-emitted prefix.
  const live = new Int32Array(vertexCount);
  for (const v of indices) live[v] = (live[v] ?? 0) + 1;
  const offset = new Int32Array(vertexCount + 1);
  for (let v = 0; v < vertexCount; v++) offset[v + 1] = (offset[v] ?? 0) + (live[v] ?? 0);
  const adj = new Int32Array(indices.length);
  const fill = new Int32Array(vertexCount);
  for (let t = 0; t < triCount; t++)
    for (let k = 0; k < 3; k++) {
      const v = indices[t * 3 + k] ?? 0;
      adj[(offset[v] ?? 0) + (fill[v] ?? 0)] = t;
      fill[v] = (fill[v] ?? 0) + 1;
    }
  const cachePos = new Int32Array(vertexCount).fill(-1);
  const score = new Float64Array(vertexCount);
  for (let v = 0; v < vertexCount; v++) score[v] = vertexScore(-1, live[v] ?? 0);
  const emitted = new Uint8Array(triCount);
  const triScoreOf = (t: number): number =>
    (score[indices[t * 3] ?? 0] ?? 0) +
    (score[indices[t * 3 + 1] ?? 0] ?? 0) +
    (score[indices[t * 3 + 2] ?? 0] ?? 0);
  let best = 0;
  let top = triScoreOf(0);
  for (let t = 1; t < triCount; t++) {
    const s = triScoreOf(t);
    if (s > top) {
      top = s;
      best = t;
    }
  }
  const out = new Uint32Array(indices.length);
  let cache = new Int32Array(CACHE + 3);
  let spare = new Int32Array(CACHE + 3);
  let size = 0;
  let cursor = 0;
  for (let n = 0; n < triCount; n++) {
    if (best < 0) {
      while (emitted[cursor]) cursor++;
      best = cursor;
    }
    const t = best;
    emitted[t] = 1;
    const a = indices[t * 3] ?? 0;
    const b = indices[t * 3 + 1] ?? 0;
    const c = indices[t * 3 + 2] ?? 0;
    out[n * 3] = a;
    out[n * 3 + 1] = b;
    out[n * 3 + 2] = c;
    for (const v of [a, b, c]) {
      // Remove t from v's live adjacency (swap with the last live entry).
      const o = offset[v] ?? 0;
      const l = live[v] ?? 0;
      for (let i = o; i < o + l; i++)
        if (adj[i] === t) {
          adj[i] = adj[o + l - 1] ?? 0;
          adj[o + l - 1] = t;
          break;
        }
      live[v] = l - 1;
    }
    // New LRU: the triangle's vertices first, then the old cache minus them.
    spare[0] = a;
    spare[1] = b;
    spare[2] = c;
    let m = 3;
    for (let i = 0; i < size; i++) {
      const v = cache[i] ?? 0;
      if (v !== a && v !== b && v !== c) spare[m++] = v;
    }
    for (let i = CACHE; i < m; i++) {
      const v = spare[i] ?? 0;
      cachePos[v] = -1;
      score[v] = vertexScore(-1, live[v] ?? 0);
    }
    [cache, spare] = [spare, cache];
    size = Math.min(m, CACHE);
    for (let i = 0; i < size; i++) {
      const v = cache[i] ?? 0;
      cachePos[v] = i;
      score[v] = vertexScore(i, live[v] ?? 0);
    }
    best = -1;
    let bestScore = -Infinity;
    for (let j = 0; j < size; j++) {
      const v = cache[j] ?? 0;
      const o = offset[v] ?? 0;
      for (let i = o; i < o + (live[v] ?? 0); i++) {
        const u = adj[i] ?? 0;
        const s = triScoreOf(u);
        if (s > bestScore || (s === bestScore && u < best)) {
          bestScore = s;
          best = u;
        }
      }
    }
  }
  return out;
}

/** Renumber vertices in order of first use; unreferenced vertices are dropped. */
export function fetchOrder(
  indices: Uint32Array,
  vertexCount: number,
): { indices: Uint32Array; order: Uint32Array } {
  const map = new Int32Array(vertexCount).fill(-1);
  const order: number[] = [];
  const out = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i] ?? 0;
    if ((map[v] ?? -1) < 0) {
      map[v] = order.length;
      order.push(v);
    }
    out[i] = map[v] ?? 0;
  }
  return { indices: out, order: Uint32Array.from(order) };
}

export interface CacheStats {
  /** Average cache misses per triangle (0.5 ideal on a regular grid, 3 worst). */
  readonly acmr: number;
  /** Misses per unique vertex (1.0 ideal). */
  readonly atvr: number;
}

/** Simulate a FIFO post-transform cache (16 entries, the meshoptimizer/NVIDIA convention). */
export function cacheStats(indices: Uint32Array, vertexCount: number, size = 16): CacheStats {
  const tris = indices.length / 3;
  if (tris === 0) return { acmr: 0, atvr: 0 };
  const stamp = new Int32Array(vertexCount).fill(-1_000_000_000);
  let misses = 0;
  for (const v of indices) {
    // A vertex is cached if it was loaded within the last `size` misses.
    if (misses - (stamp[v] ?? 0) >= size) {
      stamp[v] = misses;
      misses++;
    }
  }
  const seen = new Uint8Array(vertexCount);
  let used = 0;
  for (const v of indices)
    if (!seen[v]) {
      seen[v] = 1;
      used++;
    }
  return { acmr: misses / tris, atvr: used ? misses / used : 0 };
}
