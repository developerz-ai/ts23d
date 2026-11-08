// Page-side recipe files: which entry module makes an asset, every TypeScript file in its folder
// (multi-file recipes: siblings and nested folders) as raw text fetched on demand, and the worker's
// catalog for recipes that have no committed renders yet. The page bundle never imports a recipe
// module, so it never carries the library itself.

import { catalog } from './compile.ts';
import type { AssetInfo } from './compile-protocol.ts';

const ROOT = '../../../recipes/';
const sources = import.meta.glob<string>(
  ['../../../recipes/*/**/*.ts', '!../../../recipes/**/*.test.ts', '!../../../recipes/_*/**'],
  { query: '?raw', import: 'default' },
);
const FILES = Object.keys(sources)
  .map((p) => p.slice(ROOT.length))
  .sort();

export interface Recipe {
  /** Entry module under recipes/, e.g. `t34/t34.ts`. */
  readonly file: string;
  /** Every recipe file in the folder, entry first, e.g. `dragon/head.ts`, `roadster_v10/body/shape.ts`. */
  readonly files: readonly string[];
  /** One file's TypeScript, fetched on demand (each file is its own small chunk). */
  readonly source: (file?: string) => Promise<string>;
}

/** The recipe whose entry is `file`, or null when no such module is committed. */
export function recipeAt(file: string): Recipe | null {
  if (!FILES.includes(file)) return null;
  const folder = file.split('/')[0] ?? '';
  const rest = FILES.filter((f) => f !== file && f.startsWith(`${folder}/`));
  return {
    file,
    files: [file, ...rest],
    source: (f = file) => sources[`${ROOT}${f}`]?.() ?? Promise.resolve(''),
  };
}

/** The default entry for a folder: `recipes/<folder>/<folder>.ts`. */
export const entryFor = (folder: string): Recipe | null => recipeAt(`${folder}/${folder}.ts`);

/** Assets the worker found, with their recipes (imports every recipe module: call it lazily). */
export async function loadCatalog(): Promise<{ asset: AssetInfo; recipe: Recipe }[]> {
  const entries = await catalog();
  return entries.flatMap((e) => {
    const recipe = recipeAt(e.file);
    return recipe ? [{ asset: e.asset, recipe }] : [];
  });
}
