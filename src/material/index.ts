// Public API of @developerz.ai/ts23d/material: the shared trim-sheet layout, the procedural sheet
// painter, the material + nature libraries, `defineMaterial` for project materials, the texture
// graph DSL (`tex`), variants and weathering, palettes and engine shader sources.

export { CC0_MATERIALS, CC0_WOOD_PLANKS_GREY } from './cc0.ts';
export { CREATURE_MATERIALS } from './creature.ts';
export {
  defineMaterial,
  type MaterialInfo,
  materialOf,
  resetMaterials,
  stripCredits,
  textureSources,
} from './define.ts';
export {
  type CellImage,
  DEFAULT_SHEET,
  type MaterialPainter,
  type MaterialSurface,
  type PaintedSheet,
  type PaintKit,
  paintTrimSheet,
  type SheetRecipe,
  type StripKind,
  type StripRecipe,
} from './generator.ts';
export { MATERIAL_LIBRARY } from './library.ts';
export type { MaterialDef } from './material-def.ts';
export { NATURE_LIBRARY } from './nature.ts';
export { decodePng, type PngFailure, type Rgba } from './paint/decode-png.ts';
export { definePalette, hex, NATURAL, type Palette, palettes } from './palette.ts';
export { godotShaderSource, type ShaderHints, threeMaterialSource } from './shader.ts';
export {
  type BondOptions,
  type CellsOptions,
  type ColourField,
  type ColourInput,
  type EdgeWearOptions,
  type Input as TexInput,
  type MaterialGraph,
  type NoiseOptions,
  type ScalesOptions,
  type ScatterOptions,
  type Stamp,
  type Stop,
  type StrandsOptions,
  type StrataOptions,
  type TexContext,
  TexField,
  tex,
} from './tex/index.ts';
export {
  creditOf,
  provideTextures,
  type TextureCache,
  type TextureFile,
  type TextureSource,
} from './texture-source.ts';
export {
  type BuiltinStripId,
  CELLS,
  type CellId,
  CLASSIC_STRIPS,
  type ClassicStripId,
  CUSTOM_STRIP_SLOTS,
  type CustomStripId,
  cellRect,
  DECAL_CELLS,
  DEFAULT_SPAN,
  type DecalCellId,
  FOLIAGE_CELLS,
  type FoliageCellId,
  isFoliage,
  MATERIAL_STRIPS,
  type MaterialStripId,
  NATURE_STRIPS,
  type NatureStripId,
  STRIP_H,
  STRIP_ROWS,
  STRIPS,
  type StripId,
  spanOf,
  stripAtV,
  stripRect,
  stripRow,
  TRIM_SHEET_SIZE,
  type UvRect,
  VARIANTS,
  variantOf,
} from './trim-sheet.ts';
export { materialVariant, type WeatherOptions, weathered } from './variant.ts';
