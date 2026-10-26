// Page-side recipe catalog: metadata from the compile worker, plus each module's raw source text.
// The page bundle never imports a recipe module, so it never carries the library itself.

import { catalog } from './compile.ts';
import type { AssetInfo } from './compile-protocol.ts';

export interface Recipe {
  readonly asset: AssetInfo;
  /** File name under recipes/, e.g. `t34.ts`. */
  readonly file: string;
  /** The module's TypeScript, fetched on demand (each file is its own small chunk). */
  readonly source: () => Promise<string>;
  /** Shared name stem when one module exports several variants (`defineFamily`), e.g. `t34`. */
  readonly family: string | null;
}

const sources = import.meta.glob<string>('../../../recipes/*.ts', {
  query: '?raw',
  import: 'default',
});

export async function loadRecipes(): Promise<Recipe[]> {
  const entries = await catalog();
  return entries.map((e) => ({
    ...e,
    source: () => sources[`../../../recipes/${e.file}`]?.() ?? Promise.resolve(''),
  }));
}
