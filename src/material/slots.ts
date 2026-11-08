// The custom-strip slot table: ids registered by `defineMaterial`, in registration order, with the
// world metres each one spans along U. A leaf module (no imports) so the layout (trim-sheet.ts)
// and the registry (define.ts) can both read it.

const custom: string[] = [];
const spans = new Map<string, number>();

/** Slot index among the custom strips, or −1. */
export const customIndex = (id: string): number => custom.indexOf(id);

export const customIds = (): readonly string[] => custom;

/** U span (metres) a custom strip was registered with, or undefined. */
export const customSpan = (id: string): number | undefined => spans.get(id);

export function pushCustom(id: string, spanMetres: number): number {
  custom.push(id);
  spans.set(id, spanMetres);
  return custom.length - 1;
}

export function clearCustom(): void {
  custom.length = 0;
  spans.clear();
}
