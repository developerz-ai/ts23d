// `sound.ui`: sfxr-style game/UI effects — a few oscillators, pitch slides and fast envelopes,
// varied by seed (same seed, same blip). blip = menu tick, pickup = coin, laser = pew, hit =
// damage thump, powerup = rising arpeggio.

import { createRng, type SoundClip, Ts23dError } from '../core/index.ts';
import { makeClip, normalize, SAMPLE_RATE } from './clip.ts';
import { adsrAt, biquad, noise, oscillator, shape, type Wave } from './dsp.ts';

export type UiKind = 'blip' | 'pickup' | 'laser' | 'hit' | 'powerup';

export interface UiOptions {
  readonly kind: UiKind;
  readonly seed: number;
  readonly name?: string;
}

const KINDS: readonly UiKind[] = ['blip', 'pickup', 'laser', 'hit', 'powerup'];

export function ui(o: UiOptions): SoundClip {
  if (!KINDS.includes(o.kind) || !Number.isInteger(o.seed))
    throw new Ts23dError('T3D_AUDIO_INVALID', {
      cause: `sound.ui got kind '${o.kind}' with seed ${o.seed}`,
      fix: `kind is one of ${KINDS.join(', ')}; seed is a whole number (vary it for variants)`,
    });
  const rng = createRng(o.seed);
  const wave = rng.pick<Wave>(['square', 'square', 'saw', 'triangle']);
  const sec = (s: number): number => Math.round(s * SAMPLE_RATE);
  const t = (i: number): number => i / SAMPLE_RATE;
  let out: Float32Array;
  if (o.kind === 'blip') {
    const len = rng.range(0.06, 0.12);
    const f = rng.range(500, 1300);
    out = oscillator(sec(len), wave, (i) => (t(i) < len / 2 ? f : f * 1.5));
    shape(out, (u) =>
      adsrAt({ attack: 0.002, decay: 0.03, sustain: 0.5, release: 0.03 }, u, len - 0.03),
    );
  } else if (o.kind === 'pickup') {
    const len = rng.range(0.22, 0.35);
    const f = rng.range(700, 1400);
    const step = rng.pick([4 / 3, 3 / 2, 2]);
    const at = rng.range(0.05, 0.09);
    out = oscillator(sec(len), wave === 'saw' ? 'square' : wave, (i) => (t(i) < at ? f : f * step));
    shape(out, (u) =>
      adsrAt({ attack: 0.001, decay: 0.05, sustain: 0.6, release: len - at }, u, at),
    );
  } else if (o.kind === 'laser') {
    const len = rng.range(0.18, 0.32);
    const f0 = rng.range(1200, 2400);
    const f1 = rng.range(120, 300);
    out = oscillator(sec(len), wave, (i) => f0 * (f1 / f0) ** (t(i) / len));
    shape(out, (u) => (1 - u / len) ** 1.5);
    out = biquad(out, 'lowpass', 6000, 0.7);
  } else if (o.kind === 'hit') {
    const len = rng.range(0.15, 0.25);
    const f0 = rng.range(200, 400);
    const tone = oscillator(sec(len), 'square', (i) => f0 * (1 - 0.8 * (t(i) / len)));
    const crack = biquad(noise(sec(len), o.seed), 'lowpass', rng.range(2000, 5000), 0.7);
    out = new Float32Array(tone.length);
    for (let i = 0; i < out.length; i++) out[i] = 0.5 * (tone[i] ?? 0) + (crack[i] ?? 0);
    shape(out, (u) => Math.exp(-u / (len / 4)));
  } else {
    const len = rng.range(0.45, 0.7);
    const f = rng.range(250, 450);
    const steps = rng.int(5, 8);
    const vib = rng.range(5, 9);
    out = oscillator(sec(len), wave, (i) => {
      const k = Math.floor((t(i) / len) * steps);
      return f * 2 ** (k / 4) * (1 + 0.02 * Math.sin(2 * Math.PI * vib * t(i)));
    });
    shape(out, (u) =>
      adsrAt({ attack: 0.005, decay: 0.1, sustain: 0.7, release: 0.15 }, u, len - 0.15),
    );
  }
  normalize(out, 0.7);
  return makeClip(o.name ?? `ui_${o.kind}_${o.seed}`, out);
}
