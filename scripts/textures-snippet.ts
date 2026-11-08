// Shared pieces of the texture catalogue commands: the search hit shape, an injectable fetch
// (tests pass a fake; nothing in `bun test` touches the network), sha256, word matching, and the
// ready-to-paste `defineMaterial` snippet `bun run textures add` prints.

import type { TextureSource } from '../src/material/index.ts';

export type Fetch = (url: string) => Promise<Response>;

export interface Hit {
  readonly source: 'polyhaven' | 'ambientcg';
  readonly id: string;
  readonly name: string;
  readonly tags: readonly string[];
  /** Real-world size the image covers, metres (U × V). */
  readonly metres: readonly [number, number];
  readonly page: string;
}

export const sha256 = (b: Uint8Array): string =>
  new Bun.CryptoHasher('sha256').update(b).digest('hex');

export async function getBytes(fetch: Fetch, url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`textures: GET ${url} → HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function getJson<T>(fetch: Fetch, url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`textures: GET ${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Every word of the query appears in the haystack (case-insensitive). */
export const matches = (query: string, hay: readonly string[]): boolean => {
  const h = hay.join(' ').toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => h.includes(w));
};

/** snake_case material id from a set id ('Ground054' → 'acg_ground054'). */
export const materialId = (src: TextureSource): string =>
  `${src.source === 'polyhaven' ? 'ph' : src.source === 'ambientcg' ? 'acg' : 'tex'}_${src.id}`
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .slice(0, 32);

/** A `defineMaterial` call with every map pinned by sha256, ready to paste into a module. */
export function materialSnippet(src: TextureSource, roughness = 0.8): string {
  const id = materialId(src);
  const v = id.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
  const maps = Object.entries(src.maps)
    .flatMap(([k, f]) =>
      f
        ? [`      ${k}: {\n        url: '${f.url}',\n        sha256: '${f.sha256}',\n      },`]
        : [],
    )
    .join('\n');
  return `import { defineMaterial } from '@developerz.ai/ts23d';

/** ${src.id} (${src.source}, CC0) — ${src.page} */
export const ${v} = defineMaterial({
  id: '${id}',
  kind: 'flat',
  scaleMetres: ${Math.min(1, src.metres[1])},
  roughness: ${roughness},
  sources: ['${src.page}'],
  texture: {
    source: '${src.source}',
    id: '${src.id}',
    license: 'CC0-1.0',
    page: '${src.page}',${src.author ? `\n    author: '${src.author.replace(/'/g, "\\'")}',` : ''}
    metres: [${src.metres[0]}, ${src.metres[1]}],
    maps: {
${maps}
    },
  },
});
`;
}
