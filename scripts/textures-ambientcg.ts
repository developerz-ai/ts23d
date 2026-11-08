// ambientCG (CC0) catalogue: search the public v2 API for materials, and turn one into a pinned
// TextureSource. Sets ship as zips, so maps are `<zip url>#<entry>.png` and their sha256 is of the
// extracted entry; we take the PNG zip (JPEG is not decoded by the painter) and its Color,
// NormalGL, Roughness and AmbientOcclusion maps.

import type { TextureFile, TextureSource } from '../src/material/index.ts';
import { type Fetch, getBytes, getJson, type Hit, sha256 } from './textures-snippet.ts';
import { unzipEntry, zipEntries } from './textures-zip.ts';

const API = 'https://ambientcg.com/api/v2/full_json';

interface Asset {
  readonly assetId: string;
  readonly displayName?: string;
  readonly tags?: readonly string[];
  /** Real size, centimetres (0 when unknown). */
  readonly dimensionX?: number;
  readonly dimensionY?: number;
}

const metresOf = (a: Asset): readonly [number, number] => {
  const u = (a.dimensionX ?? 0) > 0 ? (a.dimensionX ?? 100) / 100 : 1;
  const v = (a.dimensionY ?? 0) > 0 ? (a.dimensionY ?? 100) / 100 : u;
  return [u, v];
};

const query = (q: string, extra = ''): string =>
  `${API}?type=Material&include=dimensionsData${extra}&q=${encodeURIComponent(q)}`;

export async function searchAmbientcg(q: string, fetch: Fetch, limit = 30): Promise<Hit[]> {
  const res = await getJson<{ foundAssets?: Asset[] }>(fetch, `${query(q)}&limit=${limit}`);
  return (res.foundAssets ?? []).map((a) => ({
    source: 'ambientcg' as const,
    id: a.assetId,
    name: a.displayName ?? a.assetId,
    tags: a.tags ?? [],
    metres: metresOf(a),
    page: `https://ambientcg.com/a/${a.assetId}`,
  }));
}

const MAPS = {
  albedo: 'Color',
  normal: 'NormalGL',
  roughness: 'Roughness',
  occlusion: 'AmbientOcclusion',
} as const;

/** Pin a set at `res` ('1K', '2K'…): downloads the PNG zip once, hashes each extracted map. */
export async function ambientcgSource(
  id: string,
  fetch: Fetch,
  res = '1K',
): Promise<{ source: TextureSource; bytes: Map<string, Uint8Array> }> {
  const found = await getJson<{ foundAssets?: Asset[] }>(
    fetch,
    `${API}?type=Material&include=dimensionsData&id=${encodeURIComponent(id)}`,
  );
  const asset = found.foundAssets?.find((a) => a.assetId === id);
  if (!asset)
    throw new Error(
      `textures: ambientcg has no material '${id}' (search first: bun run textures search <words> --source ambientcg)`,
    );
  const zipName = `${id}_${res}-PNG.zip`;
  const zipUrl = `https://ambientcg.com/get?file=${zipName}`;
  const zip = await getBytes(fetch, zipUrl);
  const names = new Set(zipEntries(zip).map((e) => e.name));
  const bytes = new Map<string, Uint8Array>();
  const maps: Record<string, TextureFile> = {};
  for (const [key, suffix] of Object.entries(MAPS)) {
    const entry = `${id}_${res}-PNG_${suffix}.png`;
    if (!names.has(entry)) {
      if (key === 'albedo') throw new Error(`textures: ${zipName} has no ${entry}`);
      continue;
    }
    const b = unzipEntry(zip, entry);
    const h = sha256(b);
    bytes.set(h, b);
    maps[key] = { url: `${zipUrl}#${entry}`, sha256: h };
  }
  return {
    source: {
      source: 'ambientcg',
      id,
      license: 'CC0-1.0',
      page: `https://ambientcg.com/a/${id}`,
      metres: metresOf(asset),
      maps: maps as unknown as TextureSource['maps'],
    },
    bytes,
  };
}
