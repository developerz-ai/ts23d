// `sound.engine`: a seamless idle/rev loop for a four-stroke piston engine. One combustion pulse
// per cylinder per cycle (2 revolutions) gives the firing frequency rpm/60 × cylinders/2; fixed
// per-cylinder strength (bank by firing order) plus per-cycle jitter give the burble; a
// quarter-wave exhaust pipe (f = c/4L, c ≈ 500 m/s in hot gas) and a muffler low-pass colour it.
// The loop is rendered twice from a periodic event list and the second period kept, so the last
// sample flows into the first (filters already in steady state).

import { createRng, type SoundClip, Ts23dError } from '../core/index.ts';
import { checkRange, makeClip, normalize, SAMPLE_RATE, token } from './clip.ts';
import { biquad, noise } from './dsp.ts';

export interface EngineOptions {
  readonly cylinders: number;
  readonly rpm: number;
  /** Cylinder numbers 1..n in firing order (sets which bank each pulse leaves through). */
  readonly firingOrder?: readonly number[];
  /** Pipe length (m, default 1.6) and muffler 0 (straight pipe) .. 1 (quiet); default 0.5. */
  readonly exhaust?: { readonly length?: number; readonly muffler?: number };
  /** Approximate loop length, s (default 2), rounded to whole engine cycles. */
  readonly duration?: number;
  /** Cycle-to-cycle roughness 0..1 (default 0.3): an idle lopes, a race engine at speed doesn't. */
  readonly roughness?: number;
  readonly seed?: number;
  readonly name?: string;
}

/** Firing frequency (Hz) of a four-stroke: rpm/60 × cylinders/2. */
export const firingFrequency = (rpm: number, cylinders: number): number =>
  (rpm / 60) * (cylinders / 2);

function checkOrder(order: readonly number[], n: number): void {
  const ok =
    order.length === n &&
    new Set(order).size === n &&
    order.every((c) => Number.isInteger(c) && c >= 1 && c <= n);
  if (!ok)
    throw new Ts23dError('T3D_AUDIO_INVALID', {
      cause: `firingOrder [${order.join(', ')}] is not a permutation of 1..${n}`,
      fix: 'list every cylinder once, e.g. V10: [1, 6, 5, 10, 2, 7, 3, 8, 4, 9]',
    });
}

export function engine(o: EngineOptions): SoundClip {
  const cyl = checkRange('engine cylinders', o.cylinders, 1, 16, 'cylinders: 8');
  if (!Number.isInteger(cyl))
    throw new Ts23dError('T3D_AUDIO_INVALID', {
      cause: `engine cylinders is ${cyl}, not a whole number`,
      fix: 'pass a whole count, e.g. cylinders: 10',
    });
  const rpm = checkRange('engine rpm', o.rpm, 200, 15000, 'rpm: 900');
  const order = o.firingOrder ?? Array.from({ length: cyl }, (_, i) => i + 1);
  checkOrder(order, cyl);
  const pipe = checkRange('exhaust length (m)', o.exhaust?.length ?? 1.6, 0.2, 10, 'length: 1.6');
  const muffler = checkRange('exhaust muffler', o.exhaust?.muffler ?? 0.5, 0, 1, 'muffler: 0.5');
  const rough = checkRange('engine roughness', o.roughness ?? 0.3, 0, 1, 'roughness: 0.3');
  const seconds = checkRange('engine duration (s)', o.duration ?? 2, 0.1, 20, 'duration: 2');
  const rng = createRng(o.seed ?? 1);

  // Whole cycles, and an integer sample count for the loop; each cycle gets exactly P/N samples.
  const cycles = Math.max(1, Math.round((seconds * rpm) / 120));
  const period = Math.round((cycles * 120 * SAMPLE_RATE) / rpm);
  const cycleLen = period / cycles;
  const bank = order.map((c) => (c % 2 === 0 ? 0.92 : 1.08) * rng.range(0.94, 1.06));
  const jitter = Array.from({ length: cycles * cyl }, () => ({
    amp: 1 + rng.range(-0.12, 0.12) * rough,
    dt: rng.range(-0.04, 0.04) * rough,
  }));
  // Combustion pulse ≈ 40° of crank: a raised-cosine blip.
  const width = Math.max(4, Math.round((40 / 720) * cycleLen));
  const pulses = new Float32Array(period * 2);
  for (let c = 0; c < cycles * 2; c++)
    for (let k = 0; k < cyl; k++) {
      const j = jitter[(c % cycles) * cyl + k] ?? { amp: 1, dt: 0 };
      const at = Math.round(c * cycleLen + ((k + j.dt) * cycleLen) / cyl);
      const a = (bank[k] ?? 1) * j.amp;
      for (let i = 0; i < width; i++) {
        const t = (at + i) % pulses.length;
        pulses[t] = (pulses[t] ?? 0) + a * 0.5 * (1 - Math.cos((2 * Math.PI * i) / width));
      }
    }
  // Mechanical clatter: noise gated by the firing pulses (periodic noise: two copies of one).
  const half = noise(period, (o.seed ?? 1) + 7);
  const clatter = new Float32Array(period * 2);
  for (let i = 0; i < clatter.length; i++)
    clatter[i] = (half[i % period] ?? 0) * (0.2 + (pulses[i] ?? 0));
  const f0 = firingFrequency(rpm, cyl);
  const resonance = 500 / (4 * pipe);
  const body = biquad(pulses, 'lowpass', 300 + 3500 * (1 - muffler), 0.7);
  const pipe1 = biquad(pulses, 'bandpass', resonance, 3);
  const pipe3 = biquad(pulses, 'bandpass', resonance * 3, 4);
  const tick = biquad(biquad(clatter, 'highpass', 1800, 0.7), 'lowpass', 7000, 0.7);
  const mix = new Float32Array(period * 2);
  for (let i = 0; i < mix.length; i++)
    mix[i] =
      (body[i] ?? 0) +
      0.8 * (pipe1[i] ?? 0) +
      0.35 * (1 - muffler) * (pipe3[i] ?? 0) +
      0.04 * (tick[i] ?? 0);
  // No DC (pulses are one-sided), and nothing below a third of the firing rate.
  const out = biquad(mix, 'highpass', Math.max(15, f0 / 3), 0.7).slice(period);
  normalize(out, 0.85);
  return makeClip(o.name ?? `engine_${cyl}cyl_${token(rpm)}rpm`, out, true);
}
