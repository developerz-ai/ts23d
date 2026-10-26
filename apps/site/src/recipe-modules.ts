// Worker-side recipe discovery: imports every `recipes/*.ts` module (and with it the library), and
// lists its Asset exports. The page never imports this; it asks the worker for the catalog.

import { type Asset, isAsset } from '@developerz-ai/ts23d';
import type { CatalogEntry } from './compile-protocol.ts';

const modules = import.meta.glob<Record<string, unknown>>('../../../recipes/*.ts', { eager: true });

/** Longest common `_`-delimited prefix of the names: t34 + t34_1941 → t34. */
function stem(names: readonly string[]): string | null {
  if (names.length < 2) return null;
  const split = names.map((n) => n.split('_'));
  const first = split[0] ?? [];
  const shortest = Math.min(...split.map((p) => p.length));
  let k = 0;
  while (k < shortest && split.every((p) => p[k] === first[k])) k++;
  return k > 0 ? first.slice(0, k).join('_') : null;
}

export interface Discovered extends CatalogEntry {
  readonly recipe: Asset;
}

export function discover(): Discovered[] {
  const out: Discovered[] = [];
  for (const [path, mod] of Object.entries(modules)) {
    const file = path.split('/').pop() ?? path;
    const assets = Object.values(mod).filter(isAsset);
    const family = stem(assets.map((a) => a.name));
    for (const recipe of assets) {
      const { name, kind, description, tags, budget } = recipe;
      out.push({
        recipe,
        file,
        family,
        asset: {
          name,
          kind,
          description: description ?? '',
          tags: [...(tags ?? [])],
          budget: { triangles: [...budget.triangles] },
        },
      });
    }
  }
  return out.sort((a, b) => a.asset.name.localeCompare(b.asset.name));
}
