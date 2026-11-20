// One trim sheet per asset: the built-in strips and cells plus the project materials THAT asset
// maps onto (D299). The custom rows used to belong to the process, so two recipes with a material
// on the same row could not be loaded together and fourteen rows served every recipe at once.
// `materialsOf` (asset-materials.ts) says which materials an asset maps onto; `sheetFor` paints
// them. The built-in rows are painted once per recipe and size and copied; only an asset's own
// rows are painted for it, and a row's texels do not depend on its neighbours, so the bytes equal
// a whole `paintTrimSheet(recipe, ids)`.

import { Ts23dError } from '../core/index.ts';
import { type Compiled, listOf, materialsOf } from './asset-materials.ts';
import { paintStrips, paintTrimSheet, sheetMaterials } from './generator.ts';
import { DEFAULT_SHEET } from './paint/default-sheet.ts';
import type { PaintedSheet, SheetRecipe } from './paint/types.ts';
import { CELLS, STRIPS, type StripId } from './trim-sheet.ts';

export { materialsOf } from './asset-materials.ts';

interface Base {
  /** The resolved built-in strip and cell recipes it was painted from, by identity. */
  readonly look: readonly unknown[];
  readonly sheet: PaintedSheet;
  /** The last sheet with project rows painted over a copy of `sheet`. */
  last?: { readonly look: readonly unknown[]; readonly sheet: PaintedSheet };
}

/**
 * Least recently used first. Bounded: a 4096² base is 192 MiB (and its `last` as much again), so a
 * long-lived worker painting many seeds or sizes must not keep them all. The newest always stays.
 */
const bases = new Map<string, Base>();
const BASES_KEPT = 4;
const BASES_BYTES = 256 * 1024 * 1024;
const bytesOf = (s: PaintedSheet): number => s.albedo.length + s.normal.length + s.orm.length;

function evictBases(): void {
  let bytes = 0;
  for (const b of bases.values()) bytes += bytesOf(b.sheet) + (b.last ? bytesOf(b.last.sheet) : 0);
  for (const [key, b] of bases) {
    if (bases.size <= 1 || (bases.size <= BASES_KEPT && bytes <= BASES_BYTES)) return;
    bytes -= bytesOf(b.sheet) + (b.last ? bytesOf(b.last.sheet) : 0);
    bases.delete(key);
  }
}
const same = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);
const stripLook = (recipe: SheetRecipe, ids: readonly string[]): unknown[] =>
  ids.map((id) => recipe.strips[id as StripId] ?? DEFAULT_SHEET.strips[id as StripId]);

function baseOf(recipe: SheetRecipe): Base {
  const key = `${recipe.seed}|${recipe.size ?? 4096}`;
  const look = [
    ...stripLook(recipe, STRIPS),
    ...CELLS.map((id) => recipe.cells?.[id] ?? DEFAULT_SHEET.cells?.[id]),
  ];
  const hit = bases.get(key);
  bases.delete(key);
  if (hit && same(hit.look, look)) {
    bases.set(key, hit);
    return hit;
  }
  const base: Base = { look, sheet: paintTrimSheet(recipe, []) };
  bases.set(key, base);
  evictBases();
  return base;
}

/**
 * The sheet holding exactly the project materials `ids` (built-ins and cells always): the
 * built-in rows come from a cache per recipe seed and size, so an asset costs only its own rows.
 * Treat the result as read-only: assets with the same materials share it.
 */
export function sheetWith(
  ids: readonly string[],
  recipe: SheetRecipe = DEFAULT_SHEET,
): PaintedSheet {
  const strips = sheetMaterials(ids);
  const base = baseOf(recipe);
  if (strips.length === 0) return base.sheet;
  const look = [...strips, ...stripLook(recipe, strips)];
  if (base.last && same(base.last.look, look)) return base.last.sheet;
  const from = base.sheet;
  const sheet: PaintedSheet = {
    size: from.size,
    albedo: from.albedo.slice(),
    normal: from.normal.slice(),
    orm: from.orm.slice(),
    strips,
  };
  paintStrips(sheet, recipe, strips as readonly StripId[]);
  base.last = { look, sheet };
  return sheet;
}

/**
 * The trim sheet of one asset: `recipe`'s built-ins plus the materials the asset maps onto. The
 * same asset gives the same bytes whatever else the process loaded. Pass all the LODs you export.
 * @example
 * const lods = [0, 1, 2].map((lod) => compile(crate, { lod }));
 * const sheet = sheetFor(lods, { ...DEFAULT_SHEET, size: 2048 });
 * const glb = toGlb(lods[0], { sheet });
 */
export const sheetFor = (assets: Compiled, recipe: SheetRecipe = DEFAULT_SHEET): PaintedSheet =>
  sheetWith(materialsOf(assets), recipe);

/**
 * Throw when `sheet` lacks a project material `assets` map onto: that row would render as a
 * blank, opaque strip (D47), or as another asset's material (D299). Hand-built sheets (no
 * `strips` list) are not checked.
 */
export function checkSheetFor(sheet: PaintedSheet, assets: Compiled): void {
  const painted = sheet.strips;
  if (!painted) return;
  const missing = materialsOf(assets).find((id) => !painted.includes(id));
  if (missing !== undefined)
    throw new Ts23dError('T3D_MATERIAL_UNKNOWN', {
      cause: `the trim sheet was painted without material '${missing}', which asset '${listOf(assets)[0]?.name}' maps onto: its row would render blank or as another material`,
      fix: 'paint the sheet for the asset, after compile: sheetFor(compiled, recipe); or omit `sheet` and let the renderer paint it',
    });
}
