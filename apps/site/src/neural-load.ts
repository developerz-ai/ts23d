// Worker side of the model tier: before a model-tier compile, fetch the recipe's committed model
// outputs (published by the media plugin under `media/neural/<folder>/<key>/`), re-check every
// record and hash with the library (committed bytes are untrusted), and provide them as the
// recipe's neural cache, so `ctx.neural` hits exactly as in `t3d build`. Local outputs (ADR 014:
// raw files kept on the machine that made them) are never fetched: the record's sha256 carries the
// chain, as on a fresh clone. A fetch or hash failure rejects: the model tier never silently shows
// the CPU asset under a "model tier" label. `withdrawFor` is the way back: the CPU tier of a
// recipe that holds both tiers compiles with every ask a miss.

import {
  entryOf,
  neuralCache,
  parseRecord,
  provideNeural,
  provideNeuralSource,
} from '@developerz.ai/ts23d';
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
      for (const o of record.outputs.filter((x) => !x.local))
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

/** Compile `asset` without model outputs from now on (until `provideFor` is asked again). */
export function withdrawFor(asset: string): void {
  if (!provided.delete(asset)) return;
  provideNeuralSource([asset], { get: () => null });
}
