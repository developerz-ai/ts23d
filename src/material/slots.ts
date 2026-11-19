// The custom-strip slot table: which `defineMaterial` id sits in which custom row, and the world
// metres each one spans along U. A leaf module (no imports) so the layout (trim-sheet.ts) and the
// registry (define.ts) can both read it.
// A row comes from the definition alone: the id's stable hash picks its home row, or the material
// names a `row` itself. Two materials on one row cannot both keep theirs whatever order they
// register in, so the second is refused (define.ts names the free rows) instead of probing to
// another row: probing made the same recipe compile to different UV bytes depending on what the
// process had imported before it.

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

/** The id sitting on `row`, or undefined while it is free. */
export function rowOwner(row: number): string | undefined {
  for (const [id, r] of rows) if (r === row) return id;
  return undefined;
}

/** The id sitting on `id`'s home row (itself once registered there), or undefined while free. */
export const homeOwner = (id: string, slots: number): string | undefined =>
  rowOwner(homeSlot(id, slots));

/** Rows nobody holds, ascending. */
export const freeRows = (slots: number): number[] =>
  Array.from({ length: slots }, (_, r) => r).filter((r) => rowOwner(r) === undefined);

/** `id` with the first numeric suffix whose home row is free (ids stay ≤ 32 chars), or undefined. */
export function freeId(id: string, slots: number): string | undefined {
  for (let k = 2; k < 1000; k++) {
    const next = `${id.slice(0, 28)}_${k}`;
    if (homeOwner(next, slots) === undefined) return next;
  }
  return undefined;
}

/** Put `id` on `row` (the caller checked it is free or already `id`'s). */
export function pushCustom(id: string, spanMetres: number, row: number): void {
  rows.set(id, row);
  spans.set(id, spanMetres);
}

export function clearCustom(): void {
  rows.clear();
  spans.clear();
}
