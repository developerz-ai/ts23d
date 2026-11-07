// File discovery shared by the guards: every tracked-looking .ts file under the given roots.

import { Glob } from 'bun';

export async function tsFiles(root: string, cwd = process.cwd()): Promise<string[]> {
  const out: string[] = [];
  for await (const f of new Glob(`${root}/**/*.ts`).scan({ cwd, dot: false })) {
    if (!f.includes('node_modules') && !f.includes('/dist/')) out.push(f);
  }
  return out.sort();
}

/**
 * The asset folders: recipes/<name>/<name>.ts. Folders starting with `_` hold shared helpers,
 * not assets. `stray` lists every other .ts under recipes/; the recipes gate rejects them.
 */
export async function recipeFolders(
  cwd = process.cwd(),
): Promise<{ folders: { dir: string; file: string }[]; stray: string[] }> {
  const folders: { dir: string; file: string }[] = [];
  const stray: string[] = [];
  for (const f of await tsFiles('recipes', cwd)) {
    const [, dir, name, ...rest] = f.split('/');
    if (dir?.startsWith('_')) continue;
    if (rest.length === 0 && dir && name === `${dir}.ts`)
      folders.push({ dir: `recipes/${dir}`, file: f });
    else if (!f.endsWith('.test.ts')) stray.push(f);
  }
  return { folders, stray };
}

export interface Violation {
  readonly file: string;
  readonly line: number;
  readonly message: string;
  readonly fix: string;
}

/** Print violations (or JSON) and return the exit code. */
export function report(name: string, violations: readonly Violation[], json: boolean): number {
  if (json) console.log(JSON.stringify({ ok: violations.length === 0, check: name, violations }));
  else if (violations.length === 0) console.log(`✔ ${name}`);
  else {
    console.error(`✗ ${name}: ${violations.length} violation(s)`);
    for (const v of violations)
      console.error(`  ${v.file}:${v.line}  ${v.message}\n    fix: ${v.fix}`);
  }
  return violations.length === 0 ? 0 : 1;
}
