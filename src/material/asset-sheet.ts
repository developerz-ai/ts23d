// One trim sheet per asset: the built-in strips and cells plus the project materials THAT asset
// maps onto (D299). The custom rows used to belong to the process, so two recipes with a material
// on the same row could not be loaded together and fourteen rows served every recipe at once.
// `materialsOf` reads what a compile recorded (`CompiledAsset.materials`, core/material-use.ts);
// `sheetFor` paints it. The built-in rows are painted once per recipe and size and copied; only an
// asset's own rows are painted for it, and a row's texels do not depend on its neighbours, so the
// bytes equal a whole `paintTrimSheet(recipe, ids)`.
// A mesh built outside any compile (a module-level constant) records nothing: its custom rows are
// then read from its UVs, which names the material only while one defined material holds the row.
// Known gap (open): such a mesh on a row the compile DID record for another material is read as
// the recorded one, silently; meshes carry no material provenance to tell them apart. Build every
// mesh that maps onto a project material inside build() or a definePart.

import { type CompiledAsset, type MaterialUse, Ts23dError } from '../core/index.ts';
import { materialGeneration } from './define.ts';
import { paintStrips, paintTrimSheet, sheetMaterials } from './generator.ts';
import { DEFAULT_SHEET } from './paint/default-sheet.ts';
import type { PaintedSheet, SheetRecipe } from './paint/types.ts';
import { rowsSampled } from './rows-sampled.ts';
import { customIds, idsOnRow } from './slots.ts';
import { CELLS, STRIP_ROWS, STRIPS, type StripId } from './trim-sheet.ts';

type Compiled = CompiledAsset | readonly CompiledAsset[];
const listOf = (a: Compiled): readonly CompiledAsset[] => ('parts' in a ? [a] : a);

/** Custom rows (0-based among the custom rows) the asset's sheet-mapped triangles sample. */
function customRowsSampled(asset: CompiledAsset): Set<number> {
  const out = new Set<number>();
  for (const p of asset.parts) {
    // A textured part's UVs address its own set (ADR 016), not the sheet.
    if (!p.mesh || p.textures) continue;
    const uv = p.mesh.uvs;
    const vs = new Float32Array(uv.length >> 1);
    for (let i = 0; i < vs.length; i++) vs[i] = uv[i * 2 + 1] ?? 0;
    for (const row of rowsSampled(vs, p.mesh.indices))
      if (row >= STRIPS.length && row < STRIP_ROWS) out.add(row - STRIPS.length);
  }
  return out;
}

const memo = new WeakMap<CompiledAsset, { at: number; uses: readonly MaterialUse[] }>();

function usesOf(asset: CompiledAsset): readonly MaterialUse[] {
  const at = materialGeneration();
  const hit = memo.get(asset);
  if (hit?.at === at) return hit.uses;
  const byRow = new Map((asset.materials ?? []).map((u) => [u.row, u.id]));
  // Nothing defined beyond what the compile recorded: no row can name another material.
  if (customIds().length > byRow.size)
    for (const row of customRowsSampled(asset)) {
      if (byRow.has(row)) continue;
      const [only, ...more] = idsOnRow(row);
      if (only !== undefined && more.length === 0) byRow.set(row, only);
      else if (only !== undefined)
        throw new Ts23dError('T3D_MATERIAL_UNKNOWN', {
          cause: `asset '${asset.name}' maps into custom strip row ${row} with a mesh built outside its build(), and ${[only, ...more].map((id) => `'${id}'`).join(', ')} all hold that row: which one it meant is not recorded`,
          fix: 'build the mesh inside build() or a definePart (the compile then records the material it maps onto), not in a module-level constant',
        });
    }
  const uses = [...byRow].sort((a, b) => a[0] - b[0]).map(([row, id]) => ({ id, row }));
  memo.set(asset, { at, uses });
  return uses;
}

/**
 * The project materials an asset maps onto, in row order. Pass every LOD you export together:
 * they share one sheet, so two LODs with different materials on one row are a conflict.
 */
export function materialsOf(assets: Compiled): readonly string[] {
  const byRow = new Map<number, string>();
  for (const a of listOf(assets))
    for (const u of usesOf(a)) {
      const held = byRow.get(u.row);
      if (held !== undefined && held !== u.id)
        throw new Ts23dError('T3D_MATERIAL_CONFLICT', {
          cause: `asset '${a.name}' maps onto '${held}' at one LOD and '${u.id}' at another, and both hold custom strip row ${u.row}: its LODs share one trim sheet`,
          fix: `give one of them a row the asset leaves free: defineMaterial({ id: '${u.id}', row: … })`,
        });
      byRow.set(u.row, u.id);
    }
  return [...byRow].sort((a, b) => a[0] - b[0]).map(([, id]) => id);
}

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
