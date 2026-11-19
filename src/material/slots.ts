// The custom-strip table: which custom row each `defineMaterial` id holds and the world metres it
// spans along U. A leaf module (no imports) so the layout (trim-sheet.ts) and the registry
// (define.ts) can both read it.
// A row comes from the definition alone: the `row` it names, else its id's stable hash. Many ids
// may hold the same row: the rows of a painted sheet belong to ONE asset, which holds one material
// per row (core/material-use.ts finds two on a row while the asset compiles; D299). The table is
// only id → row, so what a recipe compiles to never depends on what else the process imported.

const rows = new Map<string, number>();
const spans = new Map<string, number>();

/** FNV-1a over UTF-16 units, then murmur3's finaliser so short ids spread across few rows. */
function hash(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** The row an id takes among `slots` custom rows when its definition names none. */
export const homeSlot = (id: string, slots: number): number => hash(id) % slots;

/** Row among the custom strips, or −1. */
export const customIndex = (id: string): number => rows.get(id) ?? -1;

const byRowThenId = (a: string, b: string): number =>
  customIndex(a) - customIndex(b) || (a < b ? -1 : a > b ? 1 : 0);

/** `ids` in row order (ids on one row by name): the order a sheet lists what it painted. */
export const inRowOrder = (ids: Iterable<string>): string[] => [...new Set(ids)].sort(byRowThenId);

/** Every defined id, in row order. */
export const customIds = (): readonly string[] => inRowOrder(rows.keys());

/** The defined ids holding custom row `row`, by name. */
export const idsOnRow = (row: number): string[] => customIds().filter((id) => rows.get(id) === row);

/** U span (metres) a custom strip was registered with, or undefined. */
export const customSpan = (id: string): number | undefined => spans.get(id);

export function pushCustom(id: string, spanMetres: number, row: number): void {
  rows.set(id, row);
  spans.set(id, spanMetres);
}

export function clearCustom(): void {
  rows.clear();
  spans.clear();
}
