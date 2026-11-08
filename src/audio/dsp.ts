// The DSP toolbox the generators share: seeded white noise, phase-accumulating oscillators, ADSR
// envelopes, RBJ-cookbook biquads, a decaying mode bank (modal synthesis) and a crossfade that
// turns any render into a seamless loop. Pure functions over Float32Array; no ambient state.

import { createRng } from '../core/index.ts';
import { SAMPLE_RATE } from './clip.ts';

/** `n` samples of white noise in −1..1 from `seed` (same seed, same samples). */
export function noise(n: number, seed: number): Float32Array {
  const rng = createRng(seed);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rng.next() * 2 - 1;
  return out;
}

export type Wave = 'sine' | 'square' | 'saw' | 'triangle';

/** One cycle of `wave` at phase 0..1. */
export function waveAt(wave: Wave, phase: number): number {
  const p = phase - Math.floor(phase);
  if (wave === 'sine') return Math.sin(2 * Math.PI * p);
  if (wave === 'square') return p < 0.5 ? 1 : -1;
  if (wave === 'saw') return 2 * p - 1;
  return 1 - 4 * Math.abs(p - 0.5);
}

/** An oscillator whose frequency (Hz) may change every sample: `freq(i)`. */
export function oscillator(n: number, wave: Wave, freq: (i: number) => number): Float32Array {
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    out[i] = waveAt(wave, phase);
    phase += freq(i) / SAMPLE_RATE;
  }
  return out;
}

export interface Adsr {
  readonly attack: number;
  readonly decay: number;
  /** Level held after the decay, 0..1. */
  readonly sustain: number;
  readonly release: number;
}

/** Gain at time t (s) of a note held for `hold` seconds (release starts at hold). */
export function adsrAt(e: Adsr, t: number, hold: number): number {
  const held = (u: number): number => {
    if (u < e.attack) return e.attack > 0 ? u / e.attack : 1;
    const d = u - e.attack;
    if (d < e.decay) return 1 - (1 - e.sustain) * (d / e.decay);
    return e.sustain;
  };
  if (t < hold) return held(t);
  const r = t - hold;
  return r >= e.release ? 0 : held(hold) * (1 - r / e.release);
}

/** Multiply by an envelope in place; returns `x`. */
export function shape(x: Float32Array, gain: (t: number) => number): Float32Array {
  for (let i = 0; i < x.length; i++) x[i] = (x[i] ?? 0) * gain(i / SAMPLE_RATE);
  return x;
}

export type BiquadKind = 'lowpass' | 'highpass' | 'bandpass' | 'peak';

/** RBJ Audio-EQ-Cookbook biquad, direct form I; `gainDb` only for 'peak'. New array. */
export function biquad(
  x: Float32Array,
  kind: BiquadKind,
  freq: number,
  q: number,
  gainDb = 0,
): Float32Array {
  const w = (2 * Math.PI * Math.min(freq, SAMPLE_RATE * 0.49)) / SAMPLE_RATE;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  const a = 10 ** (gainDb / 40);
  let b0: number;
  let b1: number;
  let b2: number;
  let a0 = 1 + alpha;
  let a2 = 1 - alpha;
  if (kind === 'lowpass') [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
  else if (kind === 'highpass') [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  else if (kind === 'bandpass') [b0, b1, b2] = [alpha, 0, -alpha];
  else {
    [b0, b1, b2] = [1 + alpha * a, -2 * cos, 1 - alpha * a];
    a0 = 1 + alpha / a;
    a2 = 1 - alpha / a;
  }
  const a1 = -2 * cos;
  const out = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i] ?? 0;
    const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    out[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

/** One resonant mode: a damped sinusoid. `decay` = amplitude e-folding time in seconds. */
export interface Mode {
  readonly freq: number;
  readonly amp: number;
  readonly decay: number;
  readonly phase?: number;
}

/** Add a bank of decaying modes struck at sample `at` into `out` (in place); returns `out`. */
export function addModes(
  out: Float32Array,
  modes: readonly Mode[],
  at = 0,
  gain = 1,
): Float32Array {
  for (const m of modes) {
    if (m.freq >= SAMPLE_RATE / 2 || m.amp === 0) continue;
    // Rotate a phasor instead of calling sin/exp per sample: exact, fast and deterministic.
    const w = (2 * Math.PI * m.freq) / SAMPLE_RATE;
    const r = Math.exp(-1 / (m.decay * SAMPLE_RATE));
    const c = r * Math.cos(w);
    const s = r * Math.sin(w);
    let re = Math.cos(m.phase ?? 0) * m.amp * gain;
    let im = Math.sin(m.phase ?? 0) * m.amp * gain;
    for (let i = at; i < out.length; i++) {
      out[i] = (out[i] ?? 0) + im;
      const nr = re * c - im * s;
      im = re * s + im * c;
      re = nr;
      if (Math.abs(re) + Math.abs(im) < 1e-7) break;
    }
  }
  return out;
}

/**
 * Seamless loop: the last `fade` samples are crossfaded (equal power) under the head, and the
 * result is that many samples shorter. Sample L−1 flows straight into sample 0.
 */
export function loopify(x: Float32Array, fade: number): Float32Array {
  const len = x.length - fade;
  const out = x.slice(0, len);
  for (let i = 0; i < fade; i++) {
    const w = (i + 0.5) / fade;
    out[i] =
      (x[i] ?? 0) * Math.sin((w * Math.PI) / 2) + (x[len + i] ?? 0) * Math.cos((w * Math.PI) / 2);
  }
  return out;
}

/** Sum `src` into `out` from sample `at` with `gain` (in place); returns `out`. */
export function mixInto(out: Float32Array, src: Float32Array, at = 0, gain = 1): Float32Array {
  for (let i = 0; i < src.length && at + i < out.length; i++)
    if (at + i >= 0) out[at + i] = (out[at + i] ?? 0) + (src[i] ?? 0) * gain;
  return out;
}
