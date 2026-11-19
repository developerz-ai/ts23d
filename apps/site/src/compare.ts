// Ordering that does not depend on the visitor's browser: names sort by UTF-16 code unit, never by
// `localeCompare` (whose order follows the browser's locale, so the gallery would differ per visitor).

/** Compare two strings by code unit: the same order in every browser and in the build. */
export const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
