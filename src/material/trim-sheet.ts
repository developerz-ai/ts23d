// The shared trim sheet's layout (v3): ONE square atlas (albedo + normal + ORM) every asset maps
// into, so every asset is one material and one draw call. Strips tile along U through the REPEAT
// sampler; cells are fixed decals. Layout is data here (fractions of the sheet, so any painted
// size maps the same UVs); `paintTrimSheet` (generator.ts) paints it. V grows with world up.
// V 0–0.875: 56 strip rows of 1/64 (64 px at the 4096² house size): 8 classic, 16 library,
// 18 nature, then 14 slots for project materials (`defineMaterial`; the row comes from the id,
// slots.ts). V 0.875–1: 1/16 cells, decals then foliage. Each strip spans its own world metres
// along U (`spanOf`): 4 m for the classic and library strips (≈1 mm texels at 4096², as v2 had at
// 2048²), longer for isotropic nature strips so their texels are near square. `id~n` is a
// U-shifted variant of a strip.

import { Ts23dError } from '../core/index.ts';
import { customIndex, customSpan } from './slots.ts';
import {
  type BuiltinStripId,
  type CellId,
  DECAL_CELLS,
  type DecalCellId,
  FOLIAGE_CELLS,
  type FoliageCellId,
  type NatureStripId,
  STRIPS,
  type StripId,
} from './strip-ids.ts';

export * from './strip-ids.ts';

export interface UvRect {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
  /** Metres of world surface one full rect covers along U, so texel density is equal across assets. */
  readonly metres: number;
}

/** Strip rows in the atlas: built-ins first, then `CUSTOM_STRIP_SLOTS` project materials. */
export const STRIP_ROWS = 56;
/** One strip row's height as a fraction of the sheet. */
export const STRIP_H = 1 / 64;
export const CUSTOM_STRIP_SLOTS = STRIP_ROWS - STRIPS.length;
/** The size the layout is designed for: 64 px strip rows, 256 px cells. 2048 previews at half. */
export const TRIM_SHEET_SIZE = 4096;
/** U span (metres) of classic, library and custom strips unless a material says otherwise. */
export const DEFAULT_SPAN = 4;
/** How many U-shifted variants each strip offers (`materialVariant(id, 1..VARIANTS-1)`). */
export const VARIANTS = 16;

/**
 * Nature strips span more metres along U so their (isotropic) features get near-square texels:
 * at 4096² a 16 m span is 3.9 mm per texel along U against 7.8 mm along V at scaleMetres 0.5.
 * Bark keeps a short span: its furrows run along the trunk (V) and want fine texels across (U).
 */
const NATURE_SPAN: Readonly<Record<NatureStripId, number>> = {
  sand: 16,
  soil: 16,
  gravel: 16,
  mud: 16,
  rock_strata: 32,
  cliff: 32,
  moss: 16,
  grass: 16,
  snow: 16,
  ice: 16,
  bark_oak: 4,
  bark_pine: 4,
  bark_birch: 4,
  leaf_litter: 16,
  cobblestone: 16,
  asphalt: 16,
  water: 16,
  lava: 16,
};

/** Cells are 1/16 of the sheet, 16 per row from V 0.875: decals at 0–5, foliage from slot 8. */
const CELL = 1 / 16;
const CELL_V0 = STRIP_ROWS * STRIP_H;
const FOLIAGE_SLOT = 8;
const slotOf = (id: CellId): number => {
  const d = DECAL_CELLS.indexOf(id as DecalCellId);
  return d >= 0 ? d : FOLIAGE_SLOT + FOLIAGE_CELLS.indexOf(id as FoliageCellId);
};

const VARIANT = /^([a-z][a-z0-9_]*)~(\d{1,2})$/;
/** Split `oak~3` into its base strip and variant index (0 for a plain id). */
export function variantOf(id: string): { readonly base: string; readonly n: number } {
  const m = VARIANT.exec(id);
  return m?.[1] && m[2] ? { base: m[1], n: Number(m[2]) } : { base: id, n: 0 };
}

/** Atlas row of a strip id (variants share their base's row), or −1 when unknown. */
export function stripRow(id: string): number {
  const { base, n } = variantOf(id);
  if (n >= VARIANTS) return -1;
  const b = STRIPS.indexOf(base as BuiltinStripId);
  if (b >= 0) return b;
  const c = customIndex(base);
  return c >= 0 ? STRIPS.length + c : -1;
}

/** World metres a strip spans along U (the painter canvas and every primitive's U scale). */
export function spanOf(id: string): number {
  const { base } = variantOf(id);
  return (
    (NATURE_SPAN as Readonly<Record<string, number>>)[base] ?? customSpan(base) ?? DEFAULT_SPAN
  );
}

export function stripRect(id: StripId): UvRect {
  const i = stripRow(id);
  if (i < 0)
    throw new Ts23dError('T3D_MATERIAL_UNKNOWN', {
      cause: `strip '${id}' is neither built in nor defined`,
      fix: `use a built-in strip (${STRIPS.join(', ')}), a variant 'id~1'…'id~${VARIANTS - 1}', or register it first with defineMaterial({ id: '${id}', ... })`,
    });
  // Golden-ratio shifts: every variant starts at a different, well-spread place along the strip.
  const u0 = (variantOf(id).n * 0.6180339887) % 1;
  return { u0, v0: i * STRIP_H, u1: u0 + 1, v1: (i + 1) * STRIP_H, metres: spanOf(id) };
}

export function cellRect(id: CellId): UvRect {
  const i = slotOf(id);
  const u0 = (i % 16) * CELL;
  const v0 = CELL_V0 + Math.floor(i / 16) * CELL;
  return { u0, v0, u1: u0 + CELL, v1: v0 + CELL, metres: 1 };
}

/**
 * What the sheet holds at a V coordinate: a built-in strip id, 'custom' (a defineMaterial row),
 * 'cell' (decals and foliage) or 'plain' below the sheet. Physics and QA classify triangles by it.
 */
export function stripAtV(v: number): BuiltinStripId | 'custom' | 'cell' {
  const row = Math.floor(v / STRIP_H);
  if (row < 0) return 'plain';
  if (row < STRIPS.length) return STRIPS[row] ?? 'plain';
  return row < STRIP_ROWS ? 'custom' : 'cell';
}
