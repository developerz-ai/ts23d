// The local CC0 texture cache (`bun run textures` fills it): every file re-verified by its sha256
// name, handed to `provideTextures` before painting. Missing files are fine here; painting a
// material that needs one throws T3D_TEXTURE_MISSING with the fetch command.

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { TextureCache } from '../material/index.ts';

export const TEXTURE_CACHE = join('node_modules', '.cache', 'ts23d', 'textures');

const sha256 = (b: Uint8Array): string => new Bun.CryptoHasher('sha256').update(b).digest('hex');

/** Every cached map whose bytes still match its sha256 name. */
export async function loadTextureCache(dir = TEXTURE_CACHE): Promise<TextureCache> {
  const out = new Map<string, Uint8Array>();
  const names = await readdir(dir).catch(() => [] as string[]);
  for (const name of names.sort()) {
    const m = /^([0-9a-f]{64})\.png$/.exec(name);
    if (!m?.[1]) continue;
    const bytes = new Uint8Array(await Bun.file(join(dir, name)).arrayBuffer());
    if (sha256(bytes) === m[1]) out.set(m[1], bytes);
  }
  return out;
}
