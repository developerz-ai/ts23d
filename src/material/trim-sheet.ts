// The shared trim sheet: ONE 2048² atlas (albedo + normal + ORM) every asset maps into, so every
// asset is one material and one draw call. Strips tile along U; cells are fixed decals.
// Layout is data here; `paintTrimSheet` (generator.ts) paints it. V grows with world up on
// box/planar faces. V 0–0.875 holds 28 strip rows (64 px each at 2048²): the 8 original strips,
// 16 physically distinct materials (woods, metals, rubber, canvas, leather, plastic) and 4 slots
// for project materials (`defineMaterial`). V 0.875–1 holds 128 px cells: decals, then foliage.

import { Ts23dError } from '../core/index.ts';
import { customIndex } from './slots.ts';

/** The original eight strips: greyscale, tinted by vertex colour. */
export type ClassicStripId =
  | 'plain'
  | 'brick'
  | 'stone'
  | 'slate'
  | 'iron'
  | 'wood'
  | 'glass'
  | 'concrete';
/** Material strips with measured colour: use a near-white vertex colour (`NATURAL`) for truth. */
export type MaterialStripId =
  | 'oak'
  | 'pine'
  | 'wood_weathered'
  | 'wood_painted'
  | 'iron_rust'
  | 'iron_cast'
  | 'steel_painted'
  | 'steel_galvanised'
  | 'brass'
  | 'copper'
  | 'aluminium'
  | 'chrome'
  | 'rubber'
  | 'canvas'
  | 'leather'
  | 'plastic';
export type BuiltinStripId = ClassicStripId | MaterialStripId;
/** A project material's id, as returned by `defineMaterial` (a branded string). */
export type CustomStripId = string & { readonly __ts23dMaterial: true };
export type StripId = BuiltinStripId | CustomStripId;
export type DecalCellId = 'window_sash' | 'door_panel' | 'clock' | 'smokebox' | 'sign' | 'porthole';
/** Cutout leaf cards: the anchor (twig base) is the cell's bottom-centre, growth toward +V. */
export type FoliageCellId =
  | 'foliage_broadleaf'
  | 'foliage_maple'
  | 'foliage_maple_autumn'
  | 'foliage_birch'
  | 'foliage_acacia'
  | 'foliage_palm'
  | 'foliage_spruce'
  | 'foliage_spruce_snow'
  | 'foliage_willow'
  | 'foliage_reeds'
  | 'foliage_needles';
export type CellId = DecalCellId | FoliageCellId;

export interface UvRect {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
  /** Metres of world surface one full rect covers, so texel density is equal across assets. */
  readonly metres: number;
}

/** Strip rows in the atlas: built-ins first, then `CUSTOM_STRIP_SLOTS` project materials. */
export const STRIP_ROWS = 28;
const STRIP_H = 1 / 32;
const classic: readonly ClassicStripId[] = [
  'plain',
  'brick',
  'stone',
  'slate',
  'iron',
  'wood',
  'glass',
  'concrete',
];
const material: readonly MaterialStripId[] = [
  'oak',
  'pine',
  'wood_weathered',
  'wood_painted',
  'iron_rust',
  'iron_cast',
  'steel_painted',
  'steel_galvanised',
  'brass',
  'copper',
  'aluminium',
  'chrome',
  'rubber',
  'canvas',
  'leather',
  'plastic',
];
const strips: readonly BuiltinStripId[] = [...classic, ...material];
export const CUSTOM_STRIP_SLOTS = STRIP_ROWS - strips.length;
const decals: readonly DecalCellId[] = [
  'window_sash',
  'door_panel',
  'clock',
  'smokebox',
  'sign',
  'porthole',
];
const foliage: readonly FoliageCellId[] = [
  'foliage_broadleaf',
  'foliage_maple',
  'foliage_maple_autumn',
  'foliage_birch',
  'foliage_acacia',
  'foliage_palm',
  'foliage_spruce',
  'foliage_spruce_snow',
  'foliage_willow',
  'foliage_reeds',
  'foliage_needles',
];
const cells: readonly CellId[] = [...decals, ...foliage];
/** Cells are 1/16 of the sheet, 16 per row from V 0.875: decals at 0–5, foliage from slot 8. */
const CELL = 1 / 16;
const CELL_V0 = STRIP_ROWS * STRIP_H;
const FOLIAGE_SLOT = 8;
const slotOf = (id: CellId): number => {
  const d = decals.indexOf(id as DecalCellId);
  return d >= 0 ? d : FOLIAGE_SLOT + foliage.indexOf(id as FoliageCellId);
};

export const TRIM_SHEET_SIZE = 2048;

/** Atlas row of a strip id, or −1 when it is neither built in nor defined. */
export function stripRow(id: string): number {
  const b = strips.indexOf(id as BuiltinStripId);
  if (b >= 0) return b;
  const c = customIndex(id);
  return c >= 0 ? strips.length + c : -1;
}

export function stripRect(id: StripId): UvRect {
  const i = stripRow(id);
  if (i < 0)
    throw new Ts23dError('T3D_MATERIAL_UNKNOWN', {
      cause: `strip '${id}' is neither built in nor defined`,
      fix: `use a built-in strip (${strips.join(', ')}) or register it first with defineMaterial({ id: '${id}', ... })`,
    });
  return { u0: 0, v0: i * STRIP_H, u1: 1, v1: (i + 1) * STRIP_H, metres: 2 };
}

export function cellRect(id: CellId): UvRect {
  const i = slotOf(id);
  const u0 = (i % 16) * CELL;
  const v0 = CELL_V0 + Math.floor(i / 16) * CELL;
  return { u0, v0, u1: u0 + CELL, v1: v0 + CELL, metres: 1 };
}

/** Every built-in strip, classic first. */
export const STRIPS = strips;
export const CLASSIC_STRIPS = classic;
export const MATERIAL_STRIPS = material;
export const CELLS = cells;
export const DECAL_CELLS = decals;
export const FOLIAGE_CELLS = foliage;
export const isFoliage = (id: CellId): id is FoliageCellId => id.startsWith('foliage_');
