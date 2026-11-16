// Worker side of the model tier: before a hybrid compiles, fetch its committed model outputs
// (published by the media plugin under `media/neural/<folder>/<key>/`), re-check every record and
// hash with the library (committed bytes are untrusted), and provide them as the recipe's neural
// cache, so `ctx.neural` hits exactly as in `t3d build`. A fetch or hash failure rejects: the
// model tier never silently shows the CPU asset under a "with models" label.

import { entryOf, neuralCache, parseRecord, provideNeural } from '@developerz.ai/ts23d';
import type { NeuralRef } from './compile-protocol.ts';

const provided = new Map<string, Promise<void>>();

async function fetched(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`model output ${url} could not be fetched (HTTP ${res.status})`);
  return res;
}

async function load(asset: string, ref: NeuralRef): Promise<void> {
  const entries = await Promise.all(
    ref.dirs.map(async (dir) => {
      const where = `${dir}record.json`;
      const record = parseRecord(await (await fetched(where)).text(), where);
      const files = new Map<string, Uint8Array>();
      for (const o of record.outputs)
        files.set(o.file, new Uint8Array(await (await fetched(`${dir}${o.file}`)).arrayBuffer()));
      return entryOf(record, files);
    }),
  );
  provideNeural(neuralCache({ recipe: ref.recipe, entries, offline: true }), [asset]);
}

/** Provide `asset`'s committed model outputs once (a failed load is retried next time). */
export function provideFor(asset: string, ref: NeuralRef): Promise<void> {
  let hit = provided.get(asset);
  if (!hit) {
    hit = load(asset, ref);
    provided.set(asset, hit);
    hit.catch(() => provided.delete(asset));
  }
  return hit;
}
