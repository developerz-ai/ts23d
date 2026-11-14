// Model results cached by content: key = sha256 of (control-map hash, view names, prompt,
// negative, seed, palette, model id). A hit replays the stored images without calling the model, so
// a finished asset rebuilds offline and the gate never runs a model. Stores: in memory (tests) or a
// directory (`fileStore`, default `.ts23d/finish/`, gitignored).

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Ts23dError } from '../core/index.ts';
import type { FinishModel, FinishRequest, FinishStore } from './types.ts';

export function cacheKey(req: FinishRequest, model: string): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        v: 1,
        controls: req.views.hash,
        views: req.views.views.map((v) => v.name),
        prompt: req.prompt,
        negative: req.negative ?? '',
        seed: req.seed,
        palette: req.palette ?? [],
        model,
      }),
    )
    .digest('hex');
}

export function memoryStore(): FinishStore & { readonly size: () => number } {
  const m = new Map<string, Uint8Array[]>();
  return {
    get: (k) => Promise.resolve(m.get(k)?.map((b) => b.slice())),
    set: (k, images) => {
      m.set(
        k,
        images.map((b) => b.slice()),
      );
      return Promise.resolve();
    },
    size: () => m.size,
  };
}

/** `<dir>/<key>/<view index>.png`; a key directory is written whole or not used. */
export function fileStore(dir = '.ts23d/finish'): FinishStore {
  return {
    async get(key) {
      const d = join(dir, key);
      const names = await readdir(d).catch(() => [] as string[]);
      const pngs = names
        .filter((n) => /^\d+\.png$/.test(n))
        .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
      if (!names.includes('done') || pngs.length === 0) return undefined;
      return Promise.all(pngs.map(async (n) => new Uint8Array(await readFile(join(d, n)))));
    },
    async set(key, images) {
      const d = join(dir, key);
      await mkdir(d, { recursive: true });
      await Promise.all(images.map((b, i) => writeFile(join(d, `${i}.png`), b)));
      await writeFile(join(d, 'done'), `${images.length}\n`);
    },
  };
}

/** Run the model through the store: `hit` = replayed without calling it. */
export async function runCached(
  model: FinishModel,
  req: FinishRequest,
  store: FinishStore | undefined,
): Promise<{ images: Uint8Array[]; key: string; cache: 'hit' | 'miss' | 'off' }> {
  const key = cacheKey(req, model.id);
  if (!store) return { images: await model.run(req), key, cache: 'off' };
  const hit = await store.get(key);
  if (hit && hit.length === req.views.views.length) return { images: hit, key, cache: 'hit' };
  const images = await model.run(req);
  const want = req.views.views.length;
  if (images.length !== want)
    throw new Ts23dError('T3D_FINISH_MODEL', {
      cause: `${model.id} returned ${images.length} images for ${want} views; nothing cached`,
      fix: 'the model must answer one image per view, in view order',
    });
  await store.set(key, images);
  return { images, key, cache: 'miss' };
}
