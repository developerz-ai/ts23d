// Compile worker: recipe → CompiledAsset → GLB bytes, off the main thread. The library has zero
// dependencies, so it runs here unchanged; large buffers are transferred back, not copied. It also
// answers the catalog, per-asset manifests and the painted trim sheet. Several of these run in a
// pool (`worker-pool.ts`); each imports only the recipe modules its jobs name.

import {
  type Asset,
  type CompiledAsset,
  compile,
  DEFAULT_SHEET,
  type Lod,
  manifestOf,
  massProperties,
  paintTrimSheet,
  toGlb,
  triangleCount,
} from '@developerz.ai/ts23d';
import type {
  Answer,
  BuildRequest,
  BuildResult,
  Manifest,
  Sheet,
  SheetSize,
  Target,
  WorkerIn,
  WorkerOut,
} from './compile-protocol.ts';
import { dioramaFor } from './diorama.ts';
import { type Discovered, discover, importFile } from './recipe-modules.ts';

const recipes = new Map<string, Asset>();
const compiled = new Map<string, CompiledAsset>();

const register = (list: readonly Discovered[]): void => {
  for (const d of list) recipes.set(d.asset.name, d.recipe);
};

/** The asset `name`: from its entry file when given, else from the whole catalog. */
async function recipeNamed(name: string, file?: string): Promise<Asset> {
  if (!recipes.has(name) && file) register(await importFile(file));
  if (!recipes.has(name)) register(await discover());
  const asset = recipes.get(name);
  if (!asset) throw new Error(`no recipe exports an asset named '${name}'`);
  return asset;
}

const resolve = (t: Target): Promise<Asset> =>
  t.kind === 'diorama'
    ? Promise.resolve(dioramaFor(t.name, t.footprint))
    : recipeNamed(t.name, t.file);

/** Compile once per asset and LOD; GLB variants and the manifest reuse it. */
function compiled0(asset: Asset, lod: Lod): CompiledAsset {
  const key = `${asset.name}@${lod}`;
  const hit = compiled.get(key);
  if (hit) return hit;
  const c = compile(asset, { lod });
  // Diorama bases are one-offs; only recipes are worth keeping.
  if (recipes.get(asset.name) === asset) compiled.set(key, c);
  return c;
}

async function build(request: BuildRequest): Promise<BuildResult> {
  const asset = await resolve(request.target);
  const t0 = performance.now();
  const c = compiled0(asset, request.lod);
  const glb = toGlb(c, {
    animations: request.animations ?? true,
    keepParts: request.keepParts ?? false,
  });
  const parts = c.parts.map((p) => ({
    name: p.name,
    parent: p.parent,
    triangles: p.mesh ? triangleCount(p.mesh) : 0,
    motion: p.motion?.kind ?? null,
    emitter: p.emitter?.kind ?? null,
  }));
  const triangles = parts.reduce((n, p) => n + p.triangles, 0);
  const mp = c.physics ? massProperties(c) : null;
  return {
    glb,
    triangles,
    budget: asset.budget.triangles[request.lod],
    ms: performance.now() - t0,
    parts,
    ...(mp ? { mass: { kg: mp.mass, centre: [...mp.centerOfMass] } } : {}),
  };
}

async function manifest(name: string, file?: string): Promise<Manifest> {
  const asset = await recipeNamed(name, file);
  const lods = ([0, 1, 2] as const).map((lod) => compiled0(asset, lod));
  const { qa: _qa, files: _files, ...rest } = manifestOf(asset, lods, { lods: [] }, []);
  return rest;
}

const sheets = new Map<number, Sheet>();
/** Paint once per size: UVs are sheet fractions, so any power-of-two size maps the same strips. */
function painted(size: SheetSize | undefined): Sheet {
  const key = size ?? 0;
  const hit = sheets.get(key);
  if (hit) return hit;
  // The house sheet is 4096² (~18 s); the browser paints 2048² unless a tier asks otherwise.
  const s = paintTrimSheet({ ...DEFAULT_SHEET, size: size ?? 2048 });
  const sheet = { size: s.size, albedo: s.albedo, normal: s.normal, orm: s.orm };
  sheets.set(key, sheet);
  return sheet;
}

const post = (msg: WorkerOut, transfer: Transferable[] = []): void =>
  (self as unknown as { postMessage(m: WorkerOut, t: Transferable[]): void }).postMessage(
    msg,
    transfer,
  );

self.addEventListener('message', async (e: MessageEvent<WorkerIn>) => {
  const { id } = e.data;
  try {
    let answer: Answer;
    let transfer: Transferable[] = [];
    if ('list' in e.data) {
      const found = await discover();
      register(found);
      answer = found.map(({ asset, file, family }) => ({ asset, file, family }));
    } else if ('manifest' in e.data) answer = await manifest(e.data.manifest, e.data.file);
    else if ('sheet' in e.data) {
      // Copies, so the cached sheet survives the transfer.
      const s = painted(e.data.size);
      const copy = {
        size: s.size,
        albedo: s.albedo.slice(),
        normal: s.normal.slice(),
        orm: s.orm.slice(),
      };
      answer = copy;
      transfer = [copy.albedo.buffer, copy.normal.buffer, copy.orm.buffer];
    } else {
      const result = await build(e.data.request);
      answer = result;
      transfer = [result.glb.buffer];
    }
    post({ id, ok: true, answer }, transfer);
  } catch (error) {
    post({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
