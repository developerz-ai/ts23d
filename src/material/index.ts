// Public API of @ts23d/material: the shared trim-sheet layout, the procedural sheet painter,
// palettes and engine shader sources.

export {
  type CellImage,
  DEFAULT_SHEET,
  type PaintedSheet,
  paintTrimSheet,
  type SheetRecipe,
  type StripKind,
  type StripRecipe,
} from './generator.ts';
export { definePalette, hex, type Palette, palettes } from './palette.ts';
export { godotShaderSource, type ShaderHints, threeMaterialSource } from './shader.ts';
export {
  CELLS,
  type CellId,
  cellRect,
  DECAL_CELLS,
  type DecalCellId,
  FOLIAGE_CELLS,
  type FoliageCellId,
  isFoliage,
  STRIPS,
  type StripId,
  stripRect,
  TRIM_SHEET_SIZE,
  type UvRect,
} from './trim-sheet.ts';
