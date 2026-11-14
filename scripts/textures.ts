// Fetch CC0 texture sets for image-backed materials into a content-addressed, gitignored cache
// (node_modules/.cache/ts23d/textures/<sha256>.png), verifying every file's sha256. The library
// never touches the network: painting reads only what `loadTextureCache` hands `provideTextures`.
//   bun run textures                      the shipped CC0 examples (CC0_MATERIALS)
//   bun run textures assets/materials.ts  + every texture the module's defineMaterial() declares
//   bun run textures search <words…> [--source polyhaven|ambientcg]   list CC0 sets (id, size, page)
//   bun run textures add <id> [--source …] [--res 1k]   pin a set: caches it, prints defineMaterial
// Maps inside a zip (ambientCG) are `<zip url>#<entry>.png`; the zip is fetched once per run.

import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadTextureCache, TEXTURE_CACHE } from '../src/cli/texture-cache.ts';
import {
  CC0_MATERIALS,
  type TextureFile,
  type TextureSource,
  textureSources,
} from '../src/material/index.ts';
import { DOWNLOAD_TIMEOUT_MS, withTimeout } from './fetch-timeout.ts';
import { ambientcgSource, searchAmbientcg } from './textures-ambientcg.ts';
import { polyhavenSource, searchPolyhaven } from './textures-polyhaven.ts';
import { type Fetch, materialSnippet } from './textures-snippet.ts';
import { unzipEntry } from './textures-zip.ts';

export { loadTextureCache, TEXTURE_CACHE };

const sha256 = (b: Uint8Array): string => new Bun.CryptoHasher('sha256').update(b).digest('hex');

const zips = new Map<string, Uint8Array>();
async function download(url: string, get: Fetch): Promise<Uint8Array> {
  const res = await withTimeout(get, DOWNLOAD_TIMEOUT_MS)(url);
  if (!res.ok) throw new Error(`textures: GET ${url} → HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function bytesOf(src: TextureSource, f: TextureFile, get: Fetch): Promise<Uint8Array> {
  const [url = f.url, entry] = f.url.split('#');
  const local = src.source === 'file';
  const raw = async (): Promise<Uint8Array> =>
    local ? new Uint8Array(await Bun.file(resolve(url)).arrayBuffer()) : download(url, get);
  if (!entry) return raw();
  let zip = zips.get(url);
  if (!zip) {
    zip = await raw();
    zips.set(url, zip);
  }
  return unzipEntry(zip, entry, url);
}

/** Download (or copy) every map not yet cached; a hash mismatch is fatal and nothing is kept. */
export async function fetchTextures(
  sources: readonly TextureSource[],
  dir = TEXTURE_CACHE,
  log: (line: string) => void = () => {},
  get: Fetch = fetch,
): Promise<number> {
  await mkdir(dir, { recursive: true });
  let fetched = 0;
  for (const src of sources)
    for (const [map, f] of Object.entries(src.maps)) {
      if (!f) continue;
      const path = join(dir, `${f.sha256}.png`);
      if (await Bun.file(path).exists()) continue;
      const bytes = await bytesOf(src, f, get);
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

/** `search` / `add`: the catalogue commands. Returns printed lines (tests pass a fake fetch). */
export async function catalogue(
  argv: readonly string[],
  get: Fetch = fetch,
  dir = TEXTURE_CACHE,
): Promise<string[]> {
  const flag = (name: string, dflt: string): string => {
    const i = argv.indexOf(name);
    return i >= 0 ? (argv[i + 1] ?? dflt) : dflt;
  };
  const source = flag('--source', 'polyhaven');
  if (source !== 'polyhaven' && source !== 'ambientcg')
    throw new Error(`textures: --source ${source} is unknown\nfix: use polyhaven or ambientcg`);
  const words = argv
    .slice(1)
    .filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
  if (argv[0] === 'search') {
    const hits =
      source === 'polyhaven'
        ? await searchPolyhaven(words.join(' '), get)
        : await searchAmbientcg(words.join(' '), get);
    return [
      ...hits.map(
        (h) => `${h.id.padEnd(28)} ${`${h.metres[0]}×${h.metres[1]} m`.padEnd(14)} ${h.page}`,
      ),
      `${hits.length} ${source} set(s). Pin one: bun run textures add <id> --source ${source}`,
    ];
  }
  const id = words[0];
  if (!id)
    throw new Error('textures: add needs a set id\nfix: bun run textures search <words> first');
  const res = flag('--res', source === 'polyhaven' ? '1k' : '1K');
  const pinned =
    source === 'polyhaven'
      ? await polyhavenSource(id, get, res)
      : await ambientcgSource(id, get, res);
  await mkdir(dir, { recursive: true });
  for (const [h, b] of pinned.bytes) await Bun.write(join(dir, `${h}.png`), b);
  return [materialSnippet(pinned.source), `// cached ${pinned.bytes.size} map(s) in ${dir}`];
}

if (import.meta.main && ['search', 'add'].includes(process.argv[2] ?? '')) {
  for (const line of await catalogue(process.argv.slice(2))) console.log(line);
} else if (import.meta.main) {
  for (const mod of process.argv.slice(2)) await import(resolve(mod));
  const all = [
    ...CC0_MATERIALS.flatMap((d) => (d.texture ? [d.texture] : [])),
    ...textureSources(),
  ];
  const unique = [...new Map(all.map((s) => [`${s.source}:${s.id}`, s])).values()];
  const n = await fetchTextures(unique, TEXTURE_CACHE, console.log);
  console.log(`textures: ${unique.length} set(s), ${n} file(s) fetched → ${TEXTURE_CACHE}`);
}
