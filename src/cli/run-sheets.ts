// The trim sheet of a `t3d` run. Every asset is painted its OWN sheet (the built-ins plus the
// project materials it maps onto: `sheetFor`), so what one asset looks like never depends on which
// other recipes the run loaded (D299). `bind` says how an asset's GLBs reference it:
//   --sheet embed     the asset's sheet inside each GLB
//   --sheet external  <out>/trim_sheet_*.png, shared by the run's assets while their materials fit
//                     on one sheet (it holds all of them); an asset with a material on a row an
//                     earlier asset of the run holds gets <out>/<asset>/trim_sheet_*.png instead.
//                     <out>/trim_sheet_owners.json records which material each row of the shared
//                     sheet shows, so a LATER run into the same --out never repaints a row an
//                     earlier run's GLBs still show (D340); an asset that would need the shared
//                     sheet repainted with a material this run cannot paint gets its own too
//   --sheet none      nothing
// `sheetOf` lets a render command take either a painted sheet or the recipe to paint the asset's.

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type CompiledAsset, isTs23dError, Ts23dError } from '../core/index.ts';
import { SHEET_MAPS, type SheetBinding, sheetFileName, sheetPngs } from '../export/index.ts';
import {
  DEFAULT_SHEET,
  materialOf,
  materialsOf,
  type PaintedSheet,
  type SheetRecipe,
  type StripId,
  sheetFor,
  sheetWith,
  stripRow,
} from '../material/index.ts';
import type { Args } from './args.ts';

/** A painted sheet to use as given, or the recipe (size) to paint each asset's own from. */
export type SheetSource = PaintedSheet | SheetRecipe;

export const sheetOf = (
  source: SheetSource,
  assets: CompiledAsset | readonly CompiledAsset[],
): PaintedSheet => ('albedo' in source ? source : sheetFor(assets, source));

export interface RunSheets {
  readonly recipe: SheetRecipe;
  /** The binding for one asset's GLBs in `dir`; writes the PNGs an external binding names. */
  bind(dir: string, lods: readonly CompiledAsset[]): Promise<SheetBinding | undefined>;
}

async function writeSheet(dir: string, sheet: PaintedSheet): Promise<void> {
  const pngs = sheetPngs(sheet);
  await mkdir(dir, { recursive: true });
  for (const map of SHEET_MAPS) await Bun.write(join(dir, sheetFileName(map)), pngs[map]);
}

const OWNERS = 'trim_sheet_owners.json';

/** What an earlier run left in `out`: the shared sheet's size and row → material, if any. */
async function readOwners(out: string): Promise<{ size: number; rows: Map<number, string> }> {
  const file = Bun.file(join(out, OWNERS));
  const rows = new Map<number, string>();
  if (!(await file.exists())) return { size: 0, rows };
  const bad = (cause: string, error?: unknown): Ts23dError =>
    new Ts23dError('T3D_CLI_USAGE', {
      cause: `${join(out, OWNERS)} ${cause}${error === undefined ? '' : `: ${String(error)}`}`,
      fix: `delete ${out} (or just ${OWNERS} and the trim_sheet_*.png beside it) and rebuild every asset in it`,
    });
  let parsed: unknown;
  try {
    parsed = await file.json();
  } catch (e) {
    throw bad('is not JSON', e);
  }
  const { size, rows: raw } = (parsed ?? {}) as { size?: unknown; rows?: unknown };
  if (typeof size !== 'number' || typeof raw !== 'object' || raw === null)
    throw bad('needs { size: number, rows: { "<row>": "<material id>" } }');
  for (const [row, id] of Object.entries(raw)) {
    if (!/^\d+$/.test(row) || typeof id !== 'string') throw bad(`has a bad row '${row}'`);
    rows.set(Number(row), id);
  }
  return { size, rows };
}

/** Whether this process can paint `id` (a later run may not load the recipe that defined it). */
function paintable(id: string): boolean {
  try {
    materialOf(id as StripId);
    return true;
  } catch (e) {
    if (isTs23dError(e) && e.code === 'T3D_MATERIAL_UNKNOWN') return false;
    throw e;
  }
}

async function sheetExists(out: string): Promise<boolean> {
  for (const map of SHEET_MAPS)
    if (!(await Bun.file(join(out, sheetFileName(map))).exists())) return false;
  return true;
}

export function runSheets(args: Args): RunSheets {
  const recipe: SheetRecipe = { ...DEFAULT_SHEET, size: args.sheetSize };
  /** Atlas row → the material the shared sheet shows there (this run's and earlier runs'). */
  let shared: Map<number, string> | undefined;
  /** Size the shared sheet on disk was painted at (0: none yet). */
  let painted = 0;
  const own = async (dir: string, lods: readonly CompiledAsset[], why: string) => {
    console.error(
      `${lods[0]?.name ?? dir}: ${why}; its sheet is written beside its GLBs (${join(dir, 'trim_sheet_*.png')})`,
    );
    await writeSheet(dir, sheetWith(materialsOf(lods), recipe));
    return { external: true, prefix: 'trim_sheet' } as const;
  };
  return {
    recipe,
    async bind(dir, lods) {
      if (args.cmd !== 'build' || args.sheet === 'none') return undefined;
      if (args.sheet === 'embed') return sheetFor(lods, recipe);
      if (!shared) {
        const prior = await readOwners(args.out);
        shared = prior.rows;
        // A sheet from before owners were recorded counts as this size: only growth repaints it.
        painted = (await sheetExists(args.out)) ? prior.size || args.sheetSize : 0;
      }
      const ids = materialsOf(lods);
      if (ids.some((id) => (shared?.get(stripRow(id)) ?? id) !== id))
        return own(
          dir,
          lods,
          'a material of it holds a trim-sheet row another asset in this --out holds',
        );
      const union = new Map(shared);
      for (const id of ids) union.set(stripRow(id), id);
      if (union.size > shared.size || painted !== args.sheetSize) {
        const missing = [...union.values()].find((id) => !paintable(id));
        if (missing !== undefined)
          return own(
            dir,
            lods,
            `the shared sheet holds '${missing}', which this run does not define, and would have to be painted again`,
          );
        await writeSheet(args.out, sheetWith([...union.values()], recipe));
        const rows = Object.fromEntries([...union].sort((a, b) => a[0] - b[0]));
        await Bun.write(
          join(args.out, OWNERS),
          `${JSON.stringify({ size: args.sheetSize, rows }, null, 2)}\n`,
        );
        shared = union;
        painted = args.sheetSize;
      }
      return { external: true, prefix: '../trim_sheet' };
    },
  };
}
