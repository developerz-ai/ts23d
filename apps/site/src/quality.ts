// Rendering quality tier for this device. `high`: ambient occlusion, MSAA post, and the 2048² trim
// sheet on by default. `low` (phones, few cores): the plain forward render, a 1024² sheet off until
// asked. A slow frame budget at runtime drops `high` to plain rendering. `?quality=high|low` in the
// URL pins a tier and turns off auto-degrading.

export type Tier = 'high' | 'low';

const pinned = (): Tier | null => {
  const q = new URLSearchParams(window.location.search).get('quality');
  return q === 'high' || q === 'low' ? q : null;
};

/** True when the URL pinned the tier: never degrade at runtime. */
export const tierPinned = (): boolean => pinned() !== null;

export function qualityTier(): Tier {
  const pin = pinned();
  if (pin) return pin;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.screen.width, window.screen.height) < 600;
  const cores = navigator.hardwareConcurrency || 4;
  return coarse || small || cores < 4 ? 'low' : 'high';
}

/** Device pixel ratio cap per tier: retina sharpness costs 4× the pixels. */
export const pixelRatioFor = (tier: Tier): number =>
  Math.min(window.devicePixelRatio, tier === 'high' ? 2 : 1.5);

/**
 * Watches frame times; calls `degrade` once if the median of a window of frames is too slow.
 * Feed it the frame delta in seconds every frame.
 */
export class FrameBudget {
  private readonly samples: number[] = [];
  private fired = false;

  constructor(
    private readonly degrade: () => void,
    private readonly limit = 1 / 30,
    private readonly window = 90,
  ) {}

  tick(dt: number): void {
    if (this.fired || dt <= 0) return;
    this.samples.push(dt);
    if (this.samples.length < this.window) return;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    this.samples.length = 0;
    if (median > this.limit) {
      this.fired = true;
      this.degrade();
    }
  }
}
