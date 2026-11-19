// One compile per (asset, LOD, seed, variant) for a process that runs several `t3d` commands on the
// same recipe: `bun run shots` runs shot, hero, blueprint and icon through `run()` in one process,
// and each of them used to compile LOD0 again (human_head: about 55 s each time).
// Off by default: `compileOnce` is plain `compile` until `shareCompiles()` is called, so `t3d mcp`
// (one long-lived process, where the recipe's committed neural outputs, the import cache and
// tune.json can change between two calls) never sees an old compile. A caller that turns it on
// promises those inputs stay as they are until it calls the returned `stop`.
// Keyed on the asset OBJECT (a re-imported recipe is a new object, so a miss), the LOD, the seed
// in effect and the variant; a compile with `tuned` trial values is never shared. Consumers treat
// a CompiledAsset as read-only (compile-cache.test.ts fingerprints one around every consumer).
// Memory: every caller gets its own VIEW (new asset, parts and mesh objects over the same vertex
// arrays). QA and the renderers memoise world meshes, triangle grids, shells and solids per parts
// array and per mesh object; handing out the held objects kept all of that alive with them
// (roadster_v10: 2.7 GiB after its shot, against 77 MiB of vertex arrays). A view's derived data
// goes when the command drops the view. The oldest compiles go once the arrays pass `limitBytes`.

import { type Asset, type CompiledAsset, type CompileOptions, compile } from '../core/index.ts';

/** Vertex-array bytes held before the oldest compile is dropped (roadster_v10's six: 77 MiB). */
export const SHARED_COMPILE_BYTES = 1024 ** 3;

interface Held {
  readonly asset: Asset;
  readonly key: string;
  readonly bytes: number;
}

interface Shared {
  readonly limit: number;
  readonly byAsset: Map<Asset, Map<string, CompiledAsset>>;
  /** Insertion order, oldest first. */
  readonly held: Held[];
  bytes: number;
}

let shared: Shared | undefined;

/** Bytes of every typed array under `v` (meshes, morphs, textures); a shared buffer counts twice. */
function bytesOf(v: unknown, depth = 0): number {
  if (ArrayBuffer.isView(v)) return v.byteLength;
  if (depth > 6 || v === null || typeof v !== 'object') return 0;
  let n = 0;
  for (const x of Object.values(v)) n += bytesOf(x, depth + 1);
  return n;
}

/** What tells two compiles of one asset apart. */
export const compileKey = (asset: Asset, o: CompileOptions): string =>
  JSON.stringify([o.lod ?? 0, o.seed ?? asset.seed ?? 1, o.variant ?? null]);

/**
 * Turn sharing on for this process; returns `stop`, which turns it off and drops every compile
 * held. Only for a process whose recipe files, neural outputs and caches do not change meanwhile.
 */
export function shareCompiles(limitBytes: number = SHARED_COMPILE_BYTES): () => void {
  const mine: Shared = { limit: limitBytes, byAsset: new Map(), held: [], bytes: 0 };
  shared = mine;
  return () => {
    if (shared === mine) shared = undefined;
  };
}

/** How many compiles are held and their mesh bytes (0, 0 when sharing is off). */
export const sharedCompiles = (): { readonly count: number; readonly bytes: number } => ({
  count: shared?.held.length ?? 0,
  bytes: shared?.bytes ?? 0,
});

function drop(s: Shared): void {
  const old = s.held.shift();
  if (!old) return;
  s.bytes -= old.bytes;
  const of = s.byAsset.get(old.asset);
  of?.delete(old.key);
  if (of?.size === 0) s.byAsset.delete(old.asset);
}

/** New asset, parts and mesh objects over the same typed arrays: nothing memoised per object leaks. */
const viewOf = (a: CompiledAsset): CompiledAsset => ({
  ...a,
  parts: a.parts.map((p) => (p.mesh ? { ...p, mesh: { ...p.mesh } } : { ...p })),
});

/**
 * `compile(asset, options)`; while sharing is on, a view of the compile this process already made
 * of the same thing.
 */
export function compileOnce(asset: Asset, options: CompileOptions = {}): CompiledAsset {
  const s = shared;
  if (!s || options.tuned !== undefined) return compile(asset, options);
  const key = compileKey(asset, options);
  const hit = s.byAsset.get(asset)?.get(key);
  if (hit) return viewOf(hit);
  const made = compile(asset, options);
  const bytes = bytesOf(made.parts);
  // The newest compile is always kept, even alone over the limit: it is about to be used again.
  while (s.held.length > 0 && s.bytes + bytes > s.limit) drop(s);
  const of = s.byAsset.get(asset) ?? new Map<string, CompiledAsset>();
  of.set(key, made);
  s.byAsset.set(asset, of);
  s.held.push({ asset, key, bytes });
  s.bytes += bytes;
  return viewOf(made);
}
