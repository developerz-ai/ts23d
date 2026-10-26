// The shared trim sheet: ONE 1024² atlas (albedo + normal + ORM) every asset maps into, so every
// asset is one material and one draw call. Strips tile along U; cells are fixed decals.
// Layout is data here; `paintTrimSheet` (generator.ts) paints it. V grows with world up on
// box/planar faces. Foliage cells (cutout leaf cards, alpha = leaf mask) sit in their own rows.

export type StripId =
  | 'plain'
  | 'brick'
  | 'stone'
  | 'slate'
  | 'iron'
  | 'wood'
  | 'glass'
  | 'concrete';
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

const STRIP_H = 1 / 16;
const strips: readonly StripId[] = [
  'plain',
  'brick',
  'stone',
  'slate',
  'iron',
  'wood',
  'glass',
  'concrete',
];
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
/** Decals fill row 0 of the cell region (V 0.5); foliage starts on row 1 (V 0.625). */
const FOLIAGE_SLOT = 8;
const slotOf = (id: CellId): number => {
  const d = decals.indexOf(id as DecalCellId);
  return d >= 0 ? d : FOLIAGE_SLOT + foliage.indexOf(id as FoliageCellId);
};

export const TRIM_SHEET_SIZE = 1024;

export function stripRect(id: StripId): UvRect {
  const i = strips.indexOf(id);
  return { u0: 0, v0: i * STRIP_H, u1: 1, v1: (i + 1) * STRIP_H, metres: 2 };
}

/** Cells sit in the lower half (V ≥ 0.5), 8 per row: decals on row 0, foliage from row 1. */
export function cellRect(id: CellId): UvRect {
  const i = slotOf(id);
  const size = 1 / 8;
  const u0 = (i % 8) * size;
  const v0 = 0.5 + Math.floor(i / 8) * size;
  return { u0, v0, u1: u0 + size, v1: v0 + size, metres: 1 };
}

export const STRIPS = strips;
export const CELLS = cells;
export const DECAL_CELLS = decals;
export const FOLIAGE_CELLS = foliage;
export const isFoliage = (id: CellId): id is FoliageCellId => id.startsWith('foliage_');
