// Recipe folders stay independent: a recipe may compose another asset through its entry file
// (`../tiger_1/tiger_1.ts` for `ctx.use`), but never reach into another asset's modules or data.
// Shared code lives in recipes/_lib/ or recipes/_parts/.

import { dirname, join, normalize } from 'node:path';
import type { Violation } from './files.ts';

const IMPORT =
  /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Violations for imports from `file` (a path under recipes/) into another asset folder. */
export function crossRecipeImports(file: string, text: string): Violation[] {
  if (file.endsWith('.test.ts')) return []; // tests may check any recipe
  const own = file.split('/')[1];
  const out: Violation[] = [];
  for (const m of text.matchAll(IMPORT)) {
    const spec = m[1] ?? m[2];
    if (!spec?.startsWith('.')) continue;
    const target = normalize(join(dirname(file), spec)).split('/');
    if (target[0] !== 'recipes' || target.length < 3) continue;
    const dir = target[1] ?? '';
    if (dir === own || dir.startsWith('_')) continue;
    if (target.length === 3 && target[2] === `${dir}.ts`) continue;
    out.push({
      file,
      line: text.slice(0, m.index).split('\n').length,
      message: `imports '${spec}', a module inside another asset folder (recipes/${dir})`,
      fix: `move the shared code to recipes/_lib/<topic>/ and import it from there from both recipes (or import recipes/${dir}/${dir}.ts to compose the whole asset)`,
    });
  }
  return out;
}
