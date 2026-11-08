// The local import cache (node_modules/.cache/ts23d/imports/<sha256>.glb), the same convention as
// CC0 textures: `cacheImport` verifies a file and stores it under its hash; `loadImportCache`
// re-verifies every entry for `provideImports` before compiling a recipe that imports it. Missing
// entries are fine here; the recipe's importGlb then fails with T3D_IMPORT_MISSING and this command.

import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export const IMPORT_CACHE = join('node_modules', '.cache', 'ts23d', 'imports');

export const sha256 = (b: Uint8Array): string =>
  new Bun.CryptoHasher('sha256').update(b).digest('hex');

/** Copy `file` into the cache under its sha256; returns the hash. */
export async function cacheImport(file: string, dir = IMPORT_CACHE): Promise<string> {
  const bytes = new Uint8Array(await Bun.file(file).arrayBuffer());
  const hash = sha256(bytes);
  await mkdir(dir, { recursive: true });
  await Bun.write(join(dir, `${hash}.glb`), bytes);
  return hash;
}

/** Every cached GLB whose bytes still match its sha256 name. */
export async function loadImportCache(dir = IMPORT_CACHE): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  const names = await readdir(dir).catch(() => [] as string[]);
  for (const name of names.sort()) {
    const m = /^([0-9a-f]{64})\.glb$/.exec(name);
    if (!m?.[1]) continue;
    const bytes = new Uint8Array(await Bun.file(join(dir, name)).arrayBuffer());
    if (sha256(bytes) === m[1]) out.set(m[1], bytes);
  }
  return out;
}
