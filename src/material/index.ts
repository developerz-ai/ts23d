// Public API of @ts23d/material: the shared trim-sheet layout, palettes and shader hints.

export { definePalette, hex, type Palette, palettes } from './palette.ts';
export { type ShaderHints, threeMaterialSource } from './shader.ts';
export {
  CELLS,
  type CellId,
  cellRect,
  STRIPS,
  type StripId,
  stripRect,
  TRIM_SHEET_SIZE,
  type UvRect,
} from './trim-sheet.ts';
