// The shared trim sheet: ONE 1024² atlas (albedo + normal + ORM) every asset maps into, so every
// asset is one material and one draw call. Strips tile along U; cells are fixed decals.
// Layout is data here; the texture painter is planned (docs/plans/roadmap.md, M2).

export type StripId =
  | 'plain'
  | 'brick'
  | 'stone'
  | 'slate'
  | 'iron'
  | 'wood'
  | 'glass'
  | 'concrete';
export type CellId = 'window_sash' | 'door_panel' | 'clock' | 'smokebox' | 'sign' | 'porthole';

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
const cells: readonly CellId[] = [
  'window_sash',
  'door_panel',
  'clock',
  'smokebox',
  'sign',
  'porthole',
];

export const TRIM_SHEET_SIZE = 1024;

export function stripRect(id: StripId): UvRect {
  const i = strips.indexOf(id);
  return { u0: 0, v0: i * STRIP_H, u1: 1, v1: (i + 1) * STRIP_H, metres: 2 };
}

/** Cells sit in the lower half, 8 per row. */
export function cellRect(id: CellId): UvRect {
  const i = cells.indexOf(id);
  const size = 1 / 8;
  const u0 = (i % 8) * size;
  const v0 = 0.5 + Math.floor(i / 8) * size;
  return { u0, v0, u1: u0 + size, v1: v0 + size, metres: 1 };
}

export const STRIPS = strips;
export const CELLS = cells;
