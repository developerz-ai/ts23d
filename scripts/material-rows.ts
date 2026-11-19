// Guard: the trim sheet's custom rows are held per asset (D299). Any number of materials may be
// defined and many may sit on one row; what must hold is that no single asset maps onto two
// materials on one row, an asset composed with `ctx.use` included (its children's count as its).
// This loads every library material (creature, CC0) and every recipe entry that defines a material
// or composes other assets in ONE process (a folder with `defineMaterial(` or `.use(` in its
// sources: the others bring nothing to check, and the head recipes take 12-19 s each to import),
// then compiles each of their assets at the cheapest LOD and prints, as JSON, every id's row and
// every asset's materials. A conflict inside an asset is the compile's T3D_MATERIAL_CONFLICT; an
// asset that fails to compile for any other reason is listed as skipped and does not fail this.
// The gallery worker, `t3d build recipes/*/*.ts` and the recipes gate load many recipes at once:
// the test runs this twice, in opposite orders, and wants no error and the same answer from both.
// The recipes gate compiles every asset at every LOD, where the same error stops the build.
//   bun scripts/material-rows.ts [--reverse]

import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { loadAssets } from '../src/cli/load.ts';
import { provideRecipeNeural } from '../src/cli/neural-store.ts';
import { compile, isTs23dError } from '../src/core/index.ts';
import {
  CC0_MATERIALS,
  CREATURE_MATERIALS,
  defineMaterial,
  materialsOf,
} from '../src/material/index.ts';
import { customIds, customIndex } from '../src/material/slots.ts';
import { recipeFolders } from './lib/files.ts';

/** The LOD the guard compiles: the cheapest one (seconds for the whole tree, not minutes). */
const LOD = 2;

export interface RowReport {
  /** Custom strip row (0..13) per defined id; several ids may share one. */
  readonly rows: Readonly<Record<string, number>>;
  /** The materials each compiled asset maps onto (one per row), by asset name. */
  readonly assets: Readonly<Record<string, readonly string[]>>;
  /** One line per material conflict, and per module or library material that failed to load. */
  readonly errors: readonly string[];
  /** Assets whose compile failed for another reason (the recipes gate's to report), with it. */
  readonly skipped: readonly string[];
}

/** What differs between two reports' maps (`key: a vs b`); empty when they agree. */
export function rowDiff(
  a: Readonly<Record<string, unknown>>,
  b: Readonly<Record<string, unknown>>,
): string[] {
  const ids = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const said = (v: unknown): string => (v === undefined ? 'none' : String(v));
  return ids
    .filter((id) => said(a[id]) !== said(b[id]))
    .map((id) => `${id}: row ${said(a[id])} vs ${said(b[id])}`);
}

/** `id (row)` of two materials one asset holds on the same row; empty when each row has one. */
export function rowClashes(ids: readonly string[], rowOf: (id: string) => number): string[] {
  const held = new Map<number, string>();
  const out: string[] = [];
  for (const id of ids) {
    const other = held.get(rowOf(id));
    if (other !== undefined) out.push(`'${other}' and '${id}' both hold row ${rowOf(id)}`);
    held.set(rowOf(id), id);
  }
  return out;
}

const said = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** True when a TypeScript source in the recipe's folder defines a material or uses an asset. */
async function bringsMaterials(cwd: string, file: string): Promise<boolean> {
  const dir = join(cwd, dirname(file));
  const sources = (await readdir(dir, { recursive: true })).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
  );
  for (const f of sources) {
    const text = await Bun.file(join(dir, f)).text();
    if (text.includes('defineMaterial(') || text.includes('.use(')) return true;
  }
  return false;
}

/** Load and compile everything in this process, recipes first when `reverse`. */
export async function loadAll(reverse: boolean, cwd = process.cwd()): Promise<RowReport> {
  const errors: string[] = [];
  const skipped: string[] = [];
  const assets: Record<string, readonly string[]> = {};
  const library = [...Object.values(CREATURE_MATERIALS), ...CC0_MATERIALS];
  const files: string[] = [];
  for (const { file } of (await recipeFolders(cwd)).folders)
    if (await bringsMaterials(cwd, file)) files.push(file);
  const check = async (file: string): Promise<void> => {
    const loaded = await loadAssets(join(cwd, file));
    // The committed model outputs, as `t3d build` sees them: hybrids build their cached variant.
    const names = loaded.map((a) => a.name);
    await provideRecipeNeural(join(cwd, file), names, false);
    for (const asset of loaded)
      try {
        const ids = materialsOf(compile(asset, { lod: LOD }));
        assets[asset.name] = ids;
        for (const clash of rowClashes(ids, customIndex))
          errors.push(`${file}: asset '${asset.name}': ${clash}`);
      } catch (e) {
        const about = isTs23dError(e) && /^T3D_(MATERIAL|SHEET)_/.test(e.code);
        (about ? errors : skipped).push(`${file}: asset '${asset.name}': ${said(e)}`);
      }
  };
  const steps: { name: string; load: () => unknown }[] = [
    ...library.map((def) => ({ name: `library '${def.id}'`, load: () => defineMaterial(def) })),
    ...files.map((file) => ({ name: file, load: () => check(file) })),
  ];
  for (const step of reverse ? steps.reverse() : steps) {
    try {
      await step.load();
    } catch (e) {
      errors.push(`${step.name}: ${said(e)}`);
    }
  }
  const rows = Object.fromEntries(customIds().map((id) => [id, customIndex(id)]));
  return { rows, assets, errors, skipped };
}

if (import.meta.main) {
  const result = await loadAll(process.argv.includes('--reverse'));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.errors.length > 0 ? 1 : 0;
}
