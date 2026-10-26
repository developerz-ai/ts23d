// Page-side compile client: asks the worker for GLB bytes (cached per request), then turns bytes
// into a three.js scene. The main thread never runs the recipe compiler.

import type { AnimationClip, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type {
  BuildRequest,
  BuildResult,
  CatalogEntry,
  Lod,
  WorkerIn,
  WorkerOut,
} from './compile-protocol.ts';

export type { AssetInfo, BuildResult, Lod, PartInfo, Target } from './compile-protocol.ts';

export const LODS: readonly Lod[] = [0, 1, 2];

let worker: Worker | null = null;
let nextId = 1;
type Reply = BuildResult | readonly CatalogEntry[];
const pending = new Map<number, { resolve(r: Reply): void; reject(e: Error): void }>();
const cache = new Map<string, Promise<BuildResult>>();

function connect(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./compile.worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (e: MessageEvent<WorkerOut>) => {
    const job = pending.get(e.data.id);
    if (!job) return;
    pending.delete(e.data.id);
    if (!e.data.ok) job.reject(new Error(e.data.error));
    else job.resolve('list' in e.data ? e.data.list : e.data.result);
  });
  return worker;
}

const keyOf = (r: BuildRequest): string =>
  `${JSON.stringify(r.target)}@${r.lod}${r.keepParts ? '+parts' : ''}${r.animations === false ? '-anim' : ''}`;

function ask(body: { request: BuildRequest } | { list: true }): Promise<Reply> {
  return new Promise<Reply>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    const msg: WorkerIn = { id, ...body };
    connect().postMessage(msg);
  });
}

/** Every exported asset, as plain metadata. Recipes are imported in the worker only. */
export const catalog = (): Promise<readonly CatalogEntry[]> =>
  ask({ list: true }) as Promise<readonly CatalogEntry[]>;

/** Compile in the worker. Results are cached per request, so asking twice costs nothing. */
export function build(request: BuildRequest): Promise<BuildResult> {
  const key = keyOf(request);
  const hit = cache.get(key);
  if (hit) return hit;
  const job = ask({ request }) as Promise<BuildResult>;
  cache.set(key, job);
  job.catch(() => cache.delete(key));
  return job;
}

export const recipe = (name: string, lod: Lod): BuildRequest => ({
  target: { kind: 'recipe', name },
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
