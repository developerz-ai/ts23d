// The names on the trim sheet: built-in strip ids (classic greyscale, measured library, nature)
// and cell ids (decals, foliage cards), as types and as ordered lists. Order is the atlas order,
// so appending is safe and reordering moves every asset's UVs.

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
/** Ground, rock, vegetation, bark, water and lava: painted from texture graphs (`tex`). */
export type NatureStripId =
  | 'sand'
  | 'soil'
  | 'gravel'
  | 'mud'
  | 'rock_strata'
  | 'cliff'
  | 'moss'
  | 'grass'
  | 'snow'
  | 'ice'
  | 'bark_oak'
  | 'bark_pine'
  | 'bark_birch'
  | 'leaf_litter'
  | 'cobblestone'
  | 'asphalt'
  | 'water'
  | 'lava';
export type BuiltinStripId = ClassicStripId | MaterialStripId | NatureStripId;
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

export const CLASSIC_STRIPS: readonly ClassicStripId[] = [
  'plain',
  'brick',
  'stone',
  'slate',
  'iron',
  'wood',
  'glass',
  'concrete',
];
export const MATERIAL_STRIPS: readonly MaterialStripId[] = [
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
export const NATURE_STRIPS: readonly NatureStripId[] = [
  'sand',
  'soil',
  'gravel',
  'mud',
  'rock_strata',
  'cliff',
  'moss',
  'grass',
  'snow',
  'ice',
  'bark_oak',
  'bark_pine',
  'bark_birch',
  'leaf_litter',
  'cobblestone',
  'asphalt',
  'water',
  'lava',
];
/** Every built-in strip in atlas order: classic, library, nature. */
export const STRIPS: readonly BuiltinStripId[] = [
  ...CLASSIC_STRIPS,
  ...MATERIAL_STRIPS,
  ...NATURE_STRIPS,
];
export const DECAL_CELLS: readonly DecalCellId[] = [
  'window_sash',
  'door_panel',
  'clock',
  'smokebox',
  'sign',
  'porthole',
];
export const FOLIAGE_CELLS: readonly FoliageCellId[] = [
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
export const CELLS: readonly CellId[] = [...DECAL_CELLS, ...FOLIAGE_CELLS];
export const isFoliage = (id: CellId): id is FoliageCellId => id.startsWith('foliage_');
