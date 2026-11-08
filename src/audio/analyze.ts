// Measuring clips, for tests and for agents that can't listen: the spectrum magnitude at a
// frequency (Goertzel), the strongest frequency in a band, RMS level and the loop-seam jump.

import type { SoundClip } from '../core/index.ts';

/** Normalised magnitude of `freq` (Hz) in mono `clip` (Goertzel over the whole clip). */
export function magnitudeAt(clip: SoundClip, freq: number): number {
  const x = clip.samples;
  const w = (2 * Math.PI * freq) / clip.sampleRate;
  const c = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < x.length; i++) {
    const s0 = (x[i] ?? 0) + c * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2) / Math.max(1, x.length);
}

/**
 * The strongest frequency between `min` and `max` Hz, scanned in `step` Hz (default: half the
 * clip's frequency resolution, so a steady tone's line is never stepped over; at most 4000 probes).
 */
export function peakFrequency(clip: SoundClip, min: number, max: number, step?: number): number {
  const df =
    step ?? Math.max(clip.sampleRate / Math.max(1, clip.samples.length) / 2, (max - min) / 4000);
  let best = min;
  let mag = -1;
  for (let f = min; f <= max; f += df) {
    const m = magnitudeAt(clip, f);
    if (m > mag) [best, mag] = [f, m];
  }
  return best;
}

export function rms(clip: SoundClip): number {
  let s = 0;
  for (const v of clip.samples) s += v * v;
  return Math.sqrt(s / Math.max(1, clip.samples.length));
}

/**
 * How badly a looping clip clicks at its seam: |last − first| over the 90th-percentile step
 * between neighbouring samples. ≤ 1 = no bigger than the signal's own motion; ≫ 1 = a click.
 */
export function seamJump(clip: SoundClip): number {
  const x = clip.samples;
  const steps: number[] = [];
  for (let i = 1; i < x.length; i += 7) steps.push(Math.abs((x[i] ?? 0) - (x[i - 1] ?? 0)));
  steps.sort((p, q) => p - q);
  const p90 = steps[Math.floor(steps.length * 0.9)] ?? 0;
  return Math.abs((x[x.length - 1] ?? 0) - (x[0] ?? 0)) / Math.max(p90, 1e-9);
}
