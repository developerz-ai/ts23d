// Poly Haven (CC0) catalogue: search the public API (api.polyhaven.com) for texture sets, and turn
// one set into a pinned TextureSource — PNG albedo, OpenGL normal and packed ARM at a resolution,
// each downloaded once to compute its sha256 (and handed back so the caller can cache it).

import type { TextureFile, TextureSource } from '../src/material/index.ts';
import { type Fetch, getBytes, getJson, type Hit, matches, sha256 } from './textures-snippet.ts';

const API = 'https://api.polyhaven.com';

interface Asset {
  readonly name: string;
  readonly tags?: readonly string[];
  readonly categories?: readonly string[];
  /** Millimetres, U × V. */
  readonly dimensions?: readonly number[];
  readonly authors?: Readonly<Record<string, string>>;
}

type Files = Readonly<Record<string, Readonly<Record<string, { png?: { url: string } }>>>>;

const metresOf = (a: Asset): readonly [number, number] => {
  const [u = 1000, v = u] = a.dimensions ?? [];
  return [Math.round(u) / 1000, Math.round(v) / 1000];
};

export async function searchPolyhaven(query: string, fetch: Fetch): Promise<Hit[]> {
  const all = await getJson<Readonly<Record<string, Asset>>>(fetch, `${API}/assets?t=textures`);
  return Object.entries(all)
    .filter(([id, a]) => matches(query, [id, a.name, ...(a.tags ?? []), ...(a.categories ?? [])]))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, a]) => ({
      source: 'polyhaven' as const,
      id,
      name: a.name,
      tags: a.tags ?? [],
      metres: metresOf(a),
      page: `https://polyhaven.com/a/${id}`,
    }));
}

/** Pin a set: returns the TextureSource and the downloaded bytes by sha256. */
export async function polyhavenSource(
  id: string,
  fetch: Fetch,
  res = '1k',
): Promise<{ source: TextureSource; bytes: Map<string, Uint8Array> }> {
  const info = await getJson<Asset>(fetch, `${API}/info/${id}`);
  const files = await getJson<Files>(fetch, `${API}/files/${id}`);
  const bytes = new Map<string, Uint8Array>();
  const pin = async (key: string, required: boolean): Promise<TextureFile | undefined> => {
    const url = files[key]?.[res]?.png?.url;
    if (!url) {
      if (required) throw new Error(`textures: polyhaven '${id}' has no ${key} PNG at ${res}`);
      return undefined;
    }
    const b = await getBytes(fetch, url);
    const h = sha256(b);
    bytes.set(h, b);
    return { url, sha256: h };
  };
  const albedo = await pin('Diffuse', true);
  const normal = await pin('nor_gl', false);
  const arm = await pin('arm', false);
  if (!albedo) throw new Error('unreachable');
  const author = Object.keys(info.authors ?? {})[0];
  return {
    source: {
      source: 'polyhaven',
      id,
      license: 'CC0-1.0',
      page: `https://polyhaven.com/a/${id}`,
      ...(author ? { author } : {}),
      metres: metresOf(info),
      maps: { albedo, ...(normal ? { normal } : {}), ...(arm ? { arm } : {}) },
    },
    bytes,
  };
}
