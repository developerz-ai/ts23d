// Fetch CC0 texture sets for image-backed materials into a content-addressed, gitignored cache
// (node_modules/.cache/ts23d/textures/<sha256>.png), verifying every file's sha256. The library
// never touches the network: painting reads only what `loadTextureCache` hands `provideTextures`.
//   bun run textures                      the shipped CC0 examples (CC0_MATERIALS)
//   bun run textures assets/materials.ts  + every texture the module's defineMaterial() declares

import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadTextureCache, TEXTURE_CACHE } from '../src/cli/texture-cache.ts';
import {
  CC0_MATERIALS,
  type TextureFile,
  type TextureSource,
  textureSources,
} from '../src/material/index.ts';

export { loadTextureCache, TEXTURE_CACHE };

const sha256 = (b: Uint8Array): string => new Bun.CryptoHasher('sha256').update(b).digest('hex');

async function bytesOf(src: TextureSource, f: TextureFile): Promise<Uint8Array> {
  if (src.source === 'file') return new Uint8Array(await Bun.file(resolve(f.url)).arrayBuffer());
  const res = await fetch(f.url);
  if (!res.ok) throw new Error(`textures: GET ${f.url} → HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Download (or copy) every map not yet cached; a hash mismatch is fatal and nothing is kept. */
export async function fetchTextures(
  sources: readonly TextureSource[],
  dir = TEXTURE_CACHE,
  log: (line: string) => void = () => {},
): Promise<number> {
  await mkdir(dir, { recursive: true });
  let fetched = 0;
  for (const src of sources)
    for (const [map, f] of Object.entries(src.maps)) {
      if (!f) continue;
      const path = join(dir, `${f.sha256}.png`);
      if (await Bun.file(path).exists()) continue;
      const bytes = await bytesOf(src, f);
      const got = sha256(bytes);
      if (got !== f.sha256)
        throw new Error(
          `textures: ${src.id}/${map} sha256 ${got} ≠ declared ${f.sha256} (${f.url}).\n` +
            'fix: the file changed upstream or the hash is wrong — re-check it (sha256sum) and update the material',
        );
      await Bun.write(path, bytes);
      log(`  ✓ ${src.id}/${map}  ${(bytes.byteLength / 1e6).toFixed(1)} MB`);
      fetched++;
    }
  return fetched;
}

if (import.meta.main) {
  for (const mod of process.argv.slice(2)) await import(resolve(mod));
  const all = [
    ...CC0_MATERIALS.flatMap((d) => (d.texture ? [d.texture] : [])),
    ...textureSources(),
  ];
  const unique = [...new Map(all.map((s) => [`${s.source}:${s.id}`, s])).values()];
  const n = await fetchTextures(unique, TEXTURE_CACHE, console.log);
  console.log(`textures: ${unique.length} set(s), ${n} file(s) fetched → ${TEXTURE_CACHE}`);
}
