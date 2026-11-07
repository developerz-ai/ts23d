// The custom-strip slot table: ids registered by `defineMaterial`, in registration order. A leaf
// module (no imports) so the layout (trim-sheet.ts) and the registry (registry.ts) can both read it.

const custom: string[] = [];

/** Slot index among the custom strips, or −1. */
export const customIndex = (id: string): number => custom.indexOf(id);

export const customIds = (): readonly string[] => custom;

export function pushCustom(id: string): number {
  custom.push(id);
  return custom.length - 1;
}

export function clearCustom(): void {
  custom.length = 0;
}
