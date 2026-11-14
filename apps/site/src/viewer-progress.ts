// The viewer's compile progress: what is compiling, a bar and the elapsed seconds against the
// estimate. A compile in the worker is one synchronous call, so the bar is time-based (eases
// towards 95 % of the estimate, never claims done), and says "est." when it shows a guess. Also
// the "Load LOD0" button heavy assets get. A failed compile ends the bar in a visible message.

import { estimateSeconds, isHeavy } from './lod-policy.ts';
import { clearMessage, endInMessage, type LoadingParts, loadingParts } from './viewer-fallback.ts';
import type { Subject } from './viewer-load.ts';

const q = <T extends Element>(root: ParentNode, sel: string): T | null =>
  root.querySelector<T>(sel);

export class Progress {
  private readonly parts: LoadingParts;
  private readonly text: HTMLElement | null;
  private readonly bar: HTMLElement | null;
  private readonly time: HTMLElement | null;
  private timer = 0;

  /** `busy` gets `aria-busy` while a compile runs. */
  constructor(
    private readonly root: HTMLElement,
    private readonly busy: HTMLElement,
  ) {
    this.parts = loadingParts(root);
    this.text = q(root, '[data-loading-text]');
    this.bar = q(root, '[data-progress-bar]');
    this.time = q(root, '[data-loading-time]');
  }

  /** Show progress for a compile expected to take `estimate` seconds (null: unknown). */
  start(label: string, estimate: number | null): void {
    this.stop();
    clearMessage(this.parts);
    this.root.hidden = false;
    this.busy.setAttribute('aria-busy', 'true');
    if (this.text) this.text.textContent = label;
    const t0 = performance.now();
    const step = (): void => {
      const s = (performance.now() - t0) / 1000;
      // 1 − e^(−t/τ) with τ = estimate/2 reaches ~86 % at the estimate and creeps after it.
      const f = estimate ? Math.min(0.95, 1 - Math.exp((-2 * s) / estimate)) : null;
      if (this.bar) {
        this.bar.style.width = f === null ? '' : `${(f * 100).toFixed(1)}%`;
        this.bar.classList.toggle('indeterminate', f === null);
      }
      if (this.time)
        this.time.textContent =
          estimate && estimate >= 1.5
            ? `${s.toFixed(1)} s · est. ~${Math.round(estimate)} s`
            : `${s.toFixed(1)} s`;
    };
    step();
    this.timer = window.setInterval(step, 100);
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.root.hidden = true;
    this.busy.removeAttribute('aria-busy');
  }

  /** Stop the bar and leave why `name` failed on screen in its place (no retry loop). */
  fail(name: string, error: unknown): string {
    const why = error instanceof Error ? error.message : String(error);
    const message = `${name} failed to compile: ${why}`;
    console.error(`ts23d: ${message}`, error);
    this.stop();
    endInMessage(this.parts, message);
    return message;
  }
}

const fmt = (n: number): string => (n >= 10_000 ? `${Math.round(n / 1000)}k` : String(n));

/** The "Load LOD0" call to action for heavy assets shown at a lower LOD. */
export function lod0Label(triangles: number | undefined, estimate: number | null): string {
  const bits = [
    triangles ? `${fmt(triangles)} tris` : null,
    estimate ? `~${Math.round(estimate)} s` : null,
  ];
  const meta = bits.filter((b) => b !== null).join(' · ');
  return meta ? `Load full detail (LOD0 · ${meta})` : 'Load full detail (LOD0)';
}

/** Show the LOD0 button for a heavy asset shown at a lower LOD (hidden while compiling). */
export function syncLod0(
  button: HTMLButtonElement,
  asset: Subject,
  lod: number,
  busy: boolean,
): void {
  button.hidden = busy || lod === 0 || !isHeavy(asset);
  button.textContent = lod0Label(asset.triangles[0], estimateSeconds(asset, 0));
}
