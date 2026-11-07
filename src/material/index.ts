// Public API of @developerz.ai/ts23d/material: the shared trim-sheet layout, the procedural sheet
// painter, the material library + `defineMaterial` for project materials, palettes and engine
// shader sources.

export { CC0_MATERIALS, CC0_WOOD_PLANKS_GREY } from './cc0.ts';
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
export { definePalette, hex, NATURAL, type Palette, palettes } from './palette.ts';
export { godotShaderSource, type ShaderHints, threeMaterialSource } from './shader.ts';
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
  type DecalCellId,
  FOLIAGE_CELLS,
  type FoliageCellId,
  isFoliage,
  MATERIAL_STRIPS,
  type MaterialStripId,
  STRIP_ROWS,
  STRIPS,
  type StripId,
  stripRect,
  stripRow,
  TRIM_SHEET_SIZE,
  type UvRect,
} from './trim-sheet.ts';
