// Worker-side recipe discovery: imports every `recipes/<folder>/<folder>.ts` module (and with it the
// library), and lists its Asset exports. A module that fails to import is skipped and logged, so one
// broken recipe never empties the gallery. The page never imports this; it asks the worker.

import { type Asset, isAsset } from '@developerz.ai/ts23d';
import type { CatalogEntry } from './compile-protocol.ts';

const modules = import.meta.glob<Record<string, unknown>>('../../../recipes/*/*.ts');

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

async function load(path: string, importer: () => Promise<Record<string, unknown>>) {
  try {
    return await importer();
  } catch (error) {
    console.error(`ts23d: ${path} failed to import; skipped`, error);
    return {};
  }
}

export async function discover(): Promise<Discovered[]> {
  const out: Discovered[] = [];
  const loaded = await Promise.all(
    Object.entries(modules).map(
      async ([path, importer]) => [path, await load(path, importer)] as const,
    ),
  );
  for (const [path, mod] of loaded) {
    // Path under recipes/, e.g. `t34/t34.ts`: the folder holds the dossier and committed renders.
    const file = path.slice(path.indexOf('recipes/') + 'recipes/'.length);
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
