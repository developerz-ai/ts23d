// The gallery's item list: committed renders and manifests first (instant, no compile, and each
// already knows its recipe entry file, so the live viewer can start at once), then any recipe the
// compile worker finds that has no committed renders yet. Also derives a human title from the
// description; the category rule lives in `categories.ts`.

import { MEDIA } from 'virtual:ts23d-media';
import { CATEGORIES, type Category, categoryOf } from './categories.ts';
import type { AssetInfo } from './compile-protocol.ts';
import type { MediaEntry } from './media-types.ts';
import { entryFor, type Recipe } from './recipes.ts';

export { CATEGORIES, type Category, categoryOf } from './categories.ts';

export interface Item {
  readonly name: string;
  /** Folder under recipes/ holding the recipe, its dossier README and its committed renders. */
  readonly folder: string;
  readonly kind: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly category: Category;
  readonly title: string;
  readonly media: MediaEntry | null;
  /** The recipe files (null if the folder's entry module is missing). */
  recipe: Recipe | null;
}

/** "Tiger I mid production (late 1943) — Zimmerit, …" → "Tiger I mid production". */
export function titleOf(name: string, description: string): string {
  // A full stop ends the title only before a new sentence ("No. 60" stays whole).
  const head = description.split(/\s[—–-]\s|[:;,(]|\.(?=\s+[A-Z]|$)/)[0]?.trim() ?? '';
  if (head.length >= 3 && head.length <= 48) return head;
  return name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const make = (
  m: Pick<Item, 'name' | 'folder' | 'kind' | 'description' | 'tags' | 'media' | 'recipe'>,
): Item => ({
  ...m,
  category: categoryOf(m.kind, m.tags, m.name),
  title: titleOf(m.name, m.description),
});

/** Items with committed renders, available before any recipe is imported. */
export function mediaItems(): Item[] {
  return MEDIA.map((m) =>
    make({
      name: m.name,
      folder: m.folder,
      kind: m.kind,
      description: m.description,
      tags: m.tags,
      media: m,
      recipe: entryFor(m.folder),
    }),
  );
}

/** Add the worker's assets that have no committed renders. Returns the merged list. */
export function mergeRecipes(
  items: readonly Item[],
  found: readonly { readonly asset: AssetInfo; readonly recipe: Recipe }[],
): Item[] {
  const byName = new Map(items.map((i) => [i.name, i]));
  for (const { asset, recipe } of found) {
    const hit = byName.get(asset.name);
    if (hit) hit.recipe = recipe;
    else
      byName.set(
        asset.name,
        make({
          name: asset.name,
          folder: recipe.file.split('/')[0] ?? asset.name,
          kind: asset.kind,
          description: asset.description,
          tags: asset.tags,
          media: null,
          recipe,
        }),
      );
  }
  return order([...byName.values()]);
}

/** Category order, then name. */
export function order(items: readonly Item[]): Item[] {
  const rank = (i: Item): number => CATEGORIES.indexOf(i.category);
  return [...items].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export const REPO = 'https://github.com/developerz-ai/ts23d';
export const folderUrl = (i: Item): string => `${REPO}/tree/main/recipes/${i.folder}`;
export const dossierUrl = (i: Item): string => `${REPO}/blob/main/recipes/${i.folder}/README.md`;
export const recipeUrl = (i: Item, file = i.recipe?.file ?? `${i.folder}/${i.folder}.ts`): string =>
  `${REPO}/blob/main/recipes/${file}`;
