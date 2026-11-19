// The trim sheet of a `t3d` run. Every asset is painted its OWN sheet (the built-ins plus the
// project materials it maps onto: `sheetFor`), so what one asset looks like never depends on which
// other recipes the run loaded (D299). `bind` says how an asset's GLBs reference it:
//   --sheet embed     the asset's sheet inside each GLB
//   --sheet external  <out>/trim_sheet_*.png, shared by the run's assets while their materials fit
//                     on one sheet (it holds all of them); an asset with a material on a row an
//                     earlier asset of the run holds gets <out>/<asset>/trim_sheet_*.png instead
//   --sheet none      nothing
// `sheetOf` lets a render command take either a painted sheet or the recipe to paint the asset's.

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { CompiledAsset } from '../core/index.ts';
import { SHEET_MAPS, type SheetBinding, sheetFileName, sheetPngs } from '../export/index.ts';
import {
  DEFAULT_SHEET,
  materialsOf,
  type PaintedSheet,
  type SheetRecipe,
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

export function runSheets(args: Args): RunSheets {
  const recipe: SheetRecipe = { ...DEFAULT_SHEET, size: args.sheetSize };
  /** Atlas row → the material the run's shared sheet shows there. */
  const shared = new Map<number, string>();
  let written = false;
  return {
    recipe,
    async bind(dir, lods) {
      if (args.cmd !== 'build' || args.sheet === 'none') return undefined;
      if (args.sheet === 'embed') return sheetFor(lods, recipe);
      const ids = materialsOf(lods);
      if (ids.some((id) => (shared.get(stripRow(id)) ?? id) !== id)) {
        const name = lods[0]?.name ?? dir;
        console.error(
          `${name}: a material of it holds a trim-sheet row another asset of this run holds; its sheet is written beside its GLBs (${join(dir, 'trim_sheet_*.png')})`,
        );
        await writeSheet(dir, sheetWith(ids, recipe));
        return { external: true, prefix: 'trim_sheet' };
      }
      const grew = ids.some((id) => !shared.has(stripRow(id)));
      for (const id of ids) shared.set(stripRow(id), id);
      if (grew || !written) await writeSheet(args.out, sheetWith([...shared.values()], recipe));
      written = true;
      return { external: true, prefix: '../trim_sheet' };
    },
  };
}
