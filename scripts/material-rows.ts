// Guard: every shipped material fits one process. Loads every recipe entry that defines a material
// (a folder with a `defineMaterial(` call in its sources: the others register nothing, and the head
// recipes take 12-19 s each to import) and registers every library material (creature, CC0) in ONE
// process, then prints each custom id's sheet row as JSON.
// The gallery worker, `t3d build recipes/*/*.ts` and the recipes gate all load many recipes at
// once, so two shipped ids on one row break them (T3D_MATERIAL_CONFLICT). The test runs this twice,
// in opposite orders: no error in either, and the same row for every id in both.
//   bun scripts/material-rows.ts [--reverse]

import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CC0_MATERIALS, CREATURE_MATERIALS, defineMaterial } from '../src/material/index.ts';
import { customIds, customIndex } from '../src/material/slots.ts';
import { recipeFolders } from './lib/files.ts';

export interface RowReport {
  /** Custom strip row (0..13) per registered id. */
  readonly rows: Readonly<Record<string, number>>;
  /** One line per module or material that failed to load. */
  readonly errors: readonly string[];
}

/** What differs between two reports' rows (`id: a vs b`); empty when they agree. */
export function rowDiff(a: RowReport['rows'], b: RowReport['rows']): string[] {
  const ids = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return ids
    .filter((id) => a[id] !== b[id])
    .map((id) => `${id}: row ${a[id] ?? 'none'} vs ${b[id] ?? 'none'}`);
}

const said = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** True when any TypeScript source in the recipe's folder calls `defineMaterial(`. */
async function definesMaterial(cwd: string, file: string): Promise<boolean> {
  const dir = join(cwd, dirname(file));
  const sources = (await readdir(dir, { recursive: true })).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
  );
  for (const f of sources)
    if ((await Bun.file(join(dir, f)).text()).includes('defineMaterial(')) return true;
  return false;
}

/** Load everything in this process, recipes first when `reverse`, and report rows and errors. */
export async function loadAll(reverse: boolean, cwd = process.cwd()): Promise<RowReport> {
  const errors: string[] = [];
  const library = [...Object.values(CREATURE_MATERIALS), ...CC0_MATERIALS];
  const files: string[] = [];
  for (const { file } of (await recipeFolders(cwd)).folders)
    if (await definesMaterial(cwd, file)) files.push(file);
  const steps: { name: string; load: () => unknown }[] = [
    ...library.map((def) => ({ name: `library '${def.id}'`, load: () => defineMaterial(def) })),
    ...files.map((file) => ({ name: file, load: () => import(join(cwd, file)) })),
  ];
  for (const step of reverse ? steps.reverse() : steps) {
    try {
      await step.load();
    } catch (e) {
      errors.push(`${step.name}: ${said(e)}`);
    }
  }
  const rows = Object.fromEntries(customIds().map((id) => [id, customIndex(id)]));
  return { rows, errors };
}

if (import.meta.main) {
  const result = await loadAll(process.argv.includes('--reverse'));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.errors.length > 0 ? 1 : 0;
}
