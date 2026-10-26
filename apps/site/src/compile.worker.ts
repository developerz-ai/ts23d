// Compile worker: recipe → CompiledAsset → GLB bytes, off the main thread. The library has zero
// dependencies, so it runs here unchanged; the bytes are transferred back, not copied.

import { type Asset, compile, toGlb, triangleCount } from '@developerz-ai/ts23d';
import type { BuildRequest, BuildResult, Target, WorkerIn, WorkerOut } from './compile-protocol.ts';
import { dioramaFor } from './diorama.ts';
import { terrainAsset } from './play/terrain-asset.ts';
import { discover } from './recipe-modules.ts';

const found = discover();
const recipes = new Map(found.map((d) => [d.asset.name, d.recipe]));

function resolve(t: Target): Asset {
  if (t.kind === 'terrain') return terrainAsset;
  if (t.kind === 'diorama') return dioramaFor(t.name, t.footprint);
  const asset = recipes.get(t.name);
  if (!asset) throw new Error(`no recipe exports an asset named '${t.name}'`);
  return asset;
}

function run(request: BuildRequest): BuildResult {
  const t0 = performance.now();
  const compiled = compile(resolve(request.target), { lod: request.lod });
  const glb = toGlb(compiled, {
    animations: request.animations ?? true,
    keepParts: request.keepParts ?? false,
  });
  const parts = compiled.parts.map((p) => ({
    name: p.name,
    parent: p.parent,
    triangles: p.mesh ? triangleCount(p.mesh) : 0,
    motion: p.motion?.kind ?? null,
    emitter: p.emitter?.kind ?? null,
  }));
  const triangles = parts.reduce((n, p) => n + p.triangles, 0);
  return { glb, triangles, ms: performance.now() - t0, parts };
}

const post = (msg: WorkerOut, transfer: Transferable[] = []): void =>
  (self as unknown as { postMessage(m: WorkerOut, t: Transferable[]): void }).postMessage(
    msg,
    transfer,
  );

self.addEventListener('message', (e: MessageEvent<WorkerIn>) => {
  try {
    if ('list' in e.data) {
      post({
        id: e.data.id,
        ok: true,
        list: found.map(({ asset, file, family }) => ({ asset, file, family })),
      });
      return;
    }
    const result = run(e.data.request);
    post({ id: e.data.id, ok: true, result }, [result.glb.buffer]);
  } catch (error) {
    post({
      id: e.data.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
