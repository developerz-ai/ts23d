// The gallery's item list: committed renders and manifests first (instant, no compile), then any
// recipe the compile worker finds that has no committed renders yet. Also derives each item's
// category from its kind and tags, and a human title from its description.

import { MEDIA } from 'virtual:ts23d-media';
import type { MediaEntry } from './media-types.ts';
import type { Recipe } from './recipes.ts';

export const CATEGORIES = [
  'Vehicles',
  'Railway',
  'Architecture',
  'Nature & Terrain',
  'Characters',
  'Sci-fi',
  'Props & Materials',
] as const;
export type Category = (typeof CATEGORIES)[number];

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
  /** Set once the compile worker has imported the recipe (needed for the live viewer). */
  recipe: Recipe | null;
}

const RAIL = new Set(['rail', 'railroad', 'railway', 'rolling-stock', 'locomotive', 'lineside']);
const NATURE = new Set(['nature', 'terrain', 'tree', 'rock', 'landscape', 'vegetation']);

export function categoryOf(kind: string, tags: readonly string[]): Category {
  const has = (set: ReadonlySet<string>): boolean => tags.some((t) => set.has(t));
  if (tags.includes('sci-fi') || kind === 'scifi') return 'Sci-fi';
  if (kind === 'character' || tags.includes('character')) return 'Characters';
  if (has(RAIL) || kind === 'track') return 'Railway';
  if (kind === 'vehicle') return 'Vehicles';
  if (kind === 'building' || kind === 'structure' || kind === 'bridge') return 'Architecture';
  if (kind === 'terrain' || kind === 'vegetation' || kind === 'tree' || has(NATURE))
    return 'Nature & Terrain';
  return 'Props & Materials';
}

/** "Tiger I mid production (late 1943) — Zimmerit, …" → "Tiger I mid production". */
export function titleOf(name: string, description: string): string {
  const head = description.split(/\s[—–-]\s|[:;,(.]/)[0]?.trim() ?? '';
  if (head.length >= 3 && head.length <= 48) return head;
  return name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const make = (
  m: Pick<Item, 'name' | 'folder' | 'kind' | 'description' | 'tags' | 'media' | 'recipe'>,
): Item => ({
  ...m,
  category: categoryOf(m.kind, m.tags),
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
      recipe: null,
    }),
  );
}

/** Attach recipes to items and add the ones with no renders yet. Returns the merged list. */
export function mergeRecipes(items: readonly Item[], recipes: readonly Recipe[]): Item[] {
  const byName = new Map(items.map((i) => [i.name, i]));
  for (const r of recipes) {
    const hit = byName.get(r.asset.name);
    if (hit) hit.recipe = r;
    else
      byName.set(
        r.asset.name,
        make({
          name: r.asset.name,
          folder: r.file.split('/')[0] ?? r.asset.name,
          kind: r.asset.kind,
          description: r.asset.description,
          tags: r.asset.tags,
          media: null,
          recipe: r,
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
export const recipeUrl = (i: Item): string =>
  `${REPO}/blob/main/recipes/${i.recipe?.file ?? `${i.folder}/${i.folder}.ts`}`;
