// Compile worker: recipe → CompiledAsset → GLB bytes, off the main thread. The library has zero
// dependencies, so it runs here unchanged; large buffers are transferred back, not copied. It also
// answers the catalog, per-asset manifests and the painted trim sheet.

import {
  type Asset,
  type CompiledAsset,
  compile,
  type Lod,
  manifestOf,
  paintTrimSheet,
  toGlb,
  triangleCount,
} from '@developerz-ai/ts23d';
import type {
  Answer,
  BuildRequest,
  BuildResult,
  Manifest,
  Sheet,
  Target,
  WorkerIn,
  WorkerOut,
} from './compile-protocol.ts';
import { dioramaFor } from './diorama.ts';
import { discover } from './recipe-modules.ts';

const found = discover();
const recipes = new Map(found.map((d) => [d.asset.name, d.recipe]));
const compiled = new Map<string, CompiledAsset>();

function resolve(t: Target): Asset {
  if (t.kind === 'diorama') return dioramaFor(t.name, t.footprint);
  const asset = recipes.get(t.name);
  if (!asset) throw new Error(`no recipe exports an asset named '${t.name}'`);
  return asset;
}

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

function build(request: BuildRequest): BuildResult {
  const t0 = performance.now();
  const c = compiled0(resolve(request.target), request.lod);
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
  return { glb, triangles, ms: performance.now() - t0, parts };
}

function manifest(name: string): Manifest {
  const asset = resolve({ kind: 'recipe', name });
  const lods = ([0, 1, 2] as const).map((lod) => compiled0(asset, lod));
  const { qa: _qa, files: _files, ...rest } = manifestOf(asset, lods, { lods: [] }, []);
  return rest;
}

let sheet: Sheet | null = null;
function painted(): Sheet {
  if (sheet) return sheet;
  const s = paintTrimSheet();
  sheet = { size: s.size, albedo: s.albedo, normal: s.normal, orm: s.orm };
  return sheet;
}

const post = (msg: WorkerOut, transfer: Transferable[] = []): void =>
  (self as unknown as { postMessage(m: WorkerOut, t: Transferable[]): void }).postMessage(
    msg,
    transfer,
  );

self.addEventListener('message', (e: MessageEvent<WorkerIn>) => {
  const { id } = e.data;
  try {
    let answer: Answer;
    let transfer: Transferable[] = [];
    if ('list' in e.data)
      answer = found.map(({ asset, file, family }) => ({ asset, file, family }));
    else if ('manifest' in e.data) answer = manifest(e.data.manifest);
    else if ('sheet' in e.data) {
      // Copies, so the cached sheet survives the transfer.
      const s = painted();
      const copy = {
        size: s.size,
        albedo: s.albedo.slice(),
        normal: s.normal.slice(),
        orm: s.orm.slice(),
      };
      answer = copy;
      transfer = [copy.albedo.buffer, copy.normal.buffer, copy.orm.buffer];
    } else {
      const result = build(e.data.request);
      answer = result;
      transfer = [result.glb.buffer];
    }
    post({ id, ok: true, answer }, transfer);
  } catch (error) {
    post({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
