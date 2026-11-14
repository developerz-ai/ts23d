// How the viewer ends when it cannot show a live model: a WebGL probe (no context, no viewer chunk,
// no three.js renderer) and the one-line message that replaces the compile progress, with the
// committed hero render left on screen as the asset. Works on plain structural types so it is
// testable without a DOM; HTMLElement and HTMLCanvasElement fit them.

/** Anything that can try to open a rendering context: a canvas, or a fake in tests. */
export interface ContextSource {
  getContext(id: string): unknown;
}

/** The bits of an element the message writes. */
export interface Box {
  hidden: boolean | string;
  textContent: string | null;
  readonly classList: { add(...tokens: string[]): void; remove(...tokens: string[]): void };
}

/** The viewer's loading overlay: the box itself, its text line, progress bar and timer. */
export interface LoadingParts {
  readonly root: Box;
  readonly text: Box | null;
  readonly bar: Box | null;
  readonly time: Box | null;
}

/**
 * True when a WebGL2 or WebGL context can be created. A browser with WebGL disabled returns null
 * from `getContext`; some throw instead, which counts as no WebGL too.
 */
export function hasWebGl(make: () => ContextSource): boolean {
  try {
    const canvas = make();
    return canvas.getContext('webgl2') !== null || canvas.getContext('webgl') !== null;
  } catch (error) {
    console.warn('ts23d: WebGL probe threw; treating WebGL as unavailable', error);
    return false;
  }
}

/** The line shown instead of a live model when the browser has no WebGL. */
export const noWebGlLine = (name: string, hasHero: boolean): string =>
  hasHero
    ? `WebGL is not available in this browser, so ${name} is shown as its committed render.`
    : `WebGL is not available in this browser and ${name} has no committed render yet.`;

/**
 * End the loading overlay in a message: the spinner and the bar go, the text stays visible. No
 * retry loop; a new compile (`Progress.start`) clears the state.
 */
export function endInMessage(parts: LoadingParts, message: string): void {
  parts.root.hidden = false;
  parts.root.classList.add('failed');
  if (parts.text) parts.text.textContent = message;
  if (parts.bar) parts.bar.hidden = true;
  if (parts.time) parts.time.textContent = '';
}

/** The loading overlay's parts in the page markup (`bar` is the whole track, not its fill). */
export const loadingParts = (root: HTMLElement): LoadingParts => ({
  root,
  text: root.querySelector<HTMLElement>('[data-loading-text]'),
  bar: root.querySelector<HTMLElement>('[data-progress-bar]')?.parentElement ?? null,
  time: root.querySelector<HTMLElement>('[data-loading-time]'),
});

/** Undo `endInMessage` before a fresh compile. */
export function clearMessage(parts: LoadingParts): void {
  parts.root.classList.remove('failed');
  if (parts.bar) parts.bar.hidden = false;
}
