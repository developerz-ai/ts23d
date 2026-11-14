// The custom-strip slot table: which `defineMaterial` id sits in which custom row, and the world
// metres each one spans along U. A leaf module (no imports) so the layout (trim-sheet.ts) and the
// registry (define.ts) can both read it.
// A row comes from the id itself: a stable hash picks a home row and a taken home probes to the
// next free one. So a material's row never depends on how many materials the process registered
// before it, only on a hash clash (the shipped creature and CC0 ids have none, slots.test.ts), and
// a row never moves once given out (meshes already compiled keep valid UVs).

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

/** The row an id would take in an empty table of `slots` rows. */
export const homeSlot = (id: string, slots: number): number => hash(id) % slots;

/** Slot index among the custom strips, or −1. */
export const customIndex = (id: string): number => rows.get(id) ?? -1;

/** Registered ids in row order (what the painter walks). */
export const customIds = (): readonly string[] =>
  [...rows].sort((a, b) => a[1] - b[1]).map(([id]) => id);

/** U span (metres) a custom strip was registered with, or undefined. */
export const customSpan = (id: string): number | undefined => spans.get(id);

/** Give `id` its home row, or the next free one after it; −1 when all `slots` rows are taken. */
export function pushCustom(id: string, spanMetres: number, slots: number): number {
  const prior = rows.get(id);
  if (prior !== undefined) return prior;
  const taken = new Set(rows.values());
  const home = homeSlot(id, slots);
  for (let k = 0; k < slots; k++) {
    const row = (home + k) % slots;
    if (taken.has(row)) continue;
    rows.set(id, row);
    spans.set(id, spanMetres);
    return row;
  }
  return -1;
}

export function clearCustom(): void {
  rows.clear();
  spans.clear();
}
