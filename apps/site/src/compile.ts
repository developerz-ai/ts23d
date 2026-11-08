// Page-side compile client: asks the worker pool for GLB bytes (cached per request), then turns
// bytes into a three.js scene. The main thread never runs the recipe compiler. A build nobody
// needs any more (the visitor left a 20-second sculpt) can be cancelled.

import type { AnimationClip, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type {
  Ask,
  BuildRequest,
  BuildResult,
  CatalogEntry,
  Lod,
  Manifest,
  Sheet,
  SheetSize,
  Target,
} from './compile-protocol.ts';
import { WorkerPool } from './worker-pool.ts';

export type {
  AssetInfo,
  BuildRequest,
  BuildResult,
  Lod,
  Manifest,
  PartInfo,
  Sheet,
  Target,
} from './compile-protocol.ts';

export const LODS: readonly Lod[] = [0, 1, 2];

const pool = new WorkerPool();
const cache = new Map<string, { readonly id: number; readonly job: Promise<BuildResult> }>();

/** Cache key: the entry file is only a hint for the worker, never part of the identity. */
const targetKey = (t: Target): string =>
  t.kind === 'recipe' ? `recipe:${t.name}` : JSON.stringify(t);

const keyOf = (r: BuildRequest): string =>
  `${targetKey(r.target)}@${r.lod}${r.keepParts ? '+parts' : ''}${r.animations === false ? '-anim' : ''}`;

const ask = (body: Ask) => pool.ask(body).answer;

/** Every exported asset, as plain metadata. Recipes are imported in the worker only. */
export const catalog = (): Promise<readonly CatalogEntry[]> =>
  ask({ list: true }) as Promise<readonly CatalogEntry[]>;

const manifests = new Map<string, Promise<Manifest>>();

/** The CLI's manifest for one asset (all three LODs compiled in the worker; no QA). */
export function manifest(name: string, file?: string): Promise<Manifest> {
  let m = manifests.get(name);
  if (!m) {
    m = ask({ manifest: name, ...(file ? { file } : {}) }) as Promise<Manifest>;
    manifests.set(name, m);
    m.catch(() => manifests.delete(name));
  }
  return m;
}

const sheets = new Map<SheetSize, Promise<Sheet>>();

/**
 * The painted trim sheet at `size` px (painted once per size, in the worker: about a second at
 * 1024², about four at 2048²).
 */
export const trimSheet = (size: SheetSize): Promise<Sheet> => {
  let s = sheets.get(size);
  if (!s) {
    s = ask({ sheet: true, size }) as Promise<Sheet>;
    sheets.set(size, s);
    s.catch(() => sheets.delete(size));
  }
  return s;
};

/** Compile in the worker. Results are cached per request, so asking twice costs nothing. */
export function build(request: BuildRequest): Promise<BuildResult> {
  const key = keyOf(request);
  const hit = cache.get(key);
  if (hit) return hit.job;
  const { id, answer } = pool.ask({ request });
  const job = answer as Promise<BuildResult>;
  cache.set(key, { id, job });
  job.catch(() => cache.delete(key));
  return job;
}

/** Stop a build still running in the pool (its promise rejects with `CancelledError`). */
export function cancelBuild(request: BuildRequest): void {
  const hit = cache.get(keyOf(request));
  if (hit) pool.cancel(hit.id);
}

/** A recipe build request; `file` (e.g. `dragon/dragon.ts`) lets the worker import just that. */
export const recipe = (name: string, lod: Lod, file?: string): BuildRequest => ({
  target: { kind: 'recipe', name, ...(file ? { file } : {}) },
  lod,
});

export interface Loaded {
  readonly scene: Object3D;
  /** Bind clips by name: `rest` comes first (so viewers open still), `run` plays the motion. */
  readonly animations: readonly AnimationClip[];
  /** The build actually shown (the un-animated one if the animated GLB failed to parse). */
  readonly built: BuildResult;
}

const loader = new GLTFLoader();

function parse(glb: Uint8Array): Promise<Pick<Loaded, 'scene' | 'animations'>> {
  const buffer = glb.slice().buffer;
  return new Promise((resolve, reject) => {
    loader.parse(buffer, '', (g) => resolve({ scene: g.scene, animations: g.animations }), reject);
  });
}

/**
 * Compile and load, degrading gracefully: if the animated GLB fails to parse, load the same asset
 * without baked clips rather than show nothing.
 */
export async function loadBuilt(request: BuildRequest): Promise<Loaded> {
  const built = await build(request);
  try {
    return { ...(await parse(built.glb)), built };
  } catch (error) {
    if (request.animations === false) throw error;
    console.warn('ts23d: animated GLB failed to parse; loading it without clips', error);
    const plain = await build({ ...request, animations: false });
    return { ...(await parse(plain.glb)), built: plain };
  }
}
