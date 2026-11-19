// Hash routing, the pure part: reading `location.hash` without ever throwing, and telling an
// in-page anchor (`#main`, the "Skip to content" target) from a change of view. main.ts does the DOM.

/**
 * The hash without its `#`, percent-decoded. A malformed escape (`#%E0`) comes back as written:
 * it names no asset, so it routes home instead of throwing inside the router.
 */
export function decodeHash(hash: string): string {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Where the element a hash names lives: inside the home view, elsewhere on the page, or nowhere. */
export type AnchorPlace = 'home' | 'page' | null;

/**
 * True when a hash is an in-page anchor that must leave the shown view alone: on an asset page, an
 * id outside the (hidden) home view. An id inside home (`#gallery`) still goes home.
 */
export const keepsView = (place: AnchorPlace, onAsset: boolean): boolean =>
  onAsset && place === 'page';

/** The part of an element `toAnchor` uses: the page's elements, or a stand-in in a test. */
export interface AnchorTarget {
  scrollIntoView(): void;
  hasAttribute(name: string): boolean;
  focus(options?: { preventScroll?: boolean }): void;
}

/**
 * Scroll to the element a hash names; focus goes there too when it can take it (`main`). With
 * `scroll` false nothing moves: the catalog arriving re-runs the router without a navigation, and
 * a visitor who scrolled away must stay where they are (D193).
 */
export function toAnchor(target: AnchorTarget | null, scroll: boolean): void {
  if (!target || !scroll) return;
  target.scrollIntoView();
  if (target.hasAttribute('tabindex')) target.focus({ preventScroll: true });
}
