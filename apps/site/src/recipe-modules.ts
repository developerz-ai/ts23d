// Worker-side recipe modules. A recipe is the entry module `recipes/<folder>/<folder>.ts`; its
// siblings (`./head.ts`), nested folders (`body/…`) and the shared `recipes/_lib/**` and
// `recipes/_parts/**` arrive through its own imports, so only entries are globbed (tests never).
// `importFile` loads one recipe (what a build needs); `discover` loads all of them for the catalog.
// A module that fails to import is skipped and logged, so one broken recipe never empties the
// gallery. The page never imports this; it asks the worker.

import { type Asset, isAsset } from '@developerz.ai/ts23d';
import type { CatalogEntry } from './compile-protocol.ts';

const ROOT = '../../../recipes/';
const globbed = import.meta.glob<Record<string, unknown>>([
  '../../../recipes/*/*.ts',
  '!../../../recipes/*/*.test.ts',
  '!../../../recipes/_*/**',
]);

/** `t34/t34.ts` for `…/recipes/t34/t34.ts`; null for a sibling module like `dragon/head.ts`. */
export function entryOf(path: string): string | null {
  const file = path.slice(path.indexOf(ROOT) + ROOT.length);
  const [folder, base] = file.split('/');
  return folder && base === `${folder}.ts` ? file : null;
}

const modules = new Map<string, () => Promise<Record<string, unknown>>>();
for (const [path, importer] of Object.entries(globbed)) {
  const file = entryOf(path);
  if (file) modules.set(file, importer);
}

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

const loaded = new Map<string, Promise<Discovered[]>>();

async function load(file: string): Promise<Discovered[]> {
  const importer = modules.get(file);
  if (!importer) return [];
  let mod: Record<string, unknown>;
  try {
    mod = await importer();
  } catch (error) {
    console.error(`ts23d: recipes/${file} failed to import; skipped`, error);
    return [];
  }
  const assets = Object.values(mod).filter(isAsset);
  const family = stem(assets.map((a) => a.name));
  return assets.map((recipe) => {
    const { name, kind, description, tags, budget } = recipe;
    return {
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
    };
  });
}

/** The assets one recipe entry exports (imported once). */
export function importFile(file: string): Promise<Discovered[]> {
  let hit = loaded.get(file);
  if (!hit) {
    hit = load(file);
    loaded.set(file, hit);
  }
  return hit;
}

/** Every recipe's assets, sorted by name. */
export async function discover(): Promise<Discovered[]> {
  const all = await Promise.all([...modules.keys()].map(importFile));
  return all.flat().sort((a, b) => a.asset.name.localeCompare(b.asset.name));
}
