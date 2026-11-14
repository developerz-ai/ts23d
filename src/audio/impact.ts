// `sound.impact`: modal synthesis of a struck object. Mode frequencies come from thin-body
// bending theory, f₁ = K · √(E/ρ) · h / L² (K per shape: free-free bar 1.028, free square plate
// 0.65, bell-like shell 0.907; with h ∝ L that is f ∝ √(E/ρ) / L), with each shape's measured mode
// ratios; each mode decays as e^(−π f η t). The striker's mass and force set the contact time,
// which low-passes the excitation (Hertz contact): a heavy soft hit is dark, a light hard one bright.

import { createRng, type Rng, type SoundClip } from '../core/index.ts';
import { type Acoustic, acousticOf, waveSpeed } from './acoustics.ts';
import { checkRange, makeClip, normalize, SAMPLE_RATE, token, variant } from './clip.ts';
import { addModes, biquad, type Mode, mixInto, noise } from './dsp.ts';

export type ImpactShape = 'bar' | 'plate' | 'hollow' | 'block';

export interface ImpactOptions {
  /** Acoustic material (`steel`, `oak`, `glass`…) or a trim-sheet strip id (`iron_cast`). */
  readonly material: string;
  /** Characteristic length, m: bar length, plate side, bell mouth diameter, block edge. */
  readonly size: number;
  /** Default 'plate'. */
  readonly shape?: ImpactShape;
  /** Wall / bar thickness, m. Default a shape-typical fraction of `size`. */
  readonly thickness?: number;
  /** Striker mass, kg (default 0.5): heavier = longer contact = darker. */
  readonly mass?: number;
  /** Strike strength 0..1 (default 0.7): louder and brighter. */
  readonly force?: number;
  /** Longest clip, s (default 4); shorter when the ring dies sooner. */
  readonly duration?: number;
  readonly seed?: number;
  readonly name?: string;
}

const SHAPES: Readonly<Record<ImpactShape, { k: number; h: number; ratios: readonly number[] }>> = {
  // Free-free Euler–Bernoulli beam: (βL)² = 22.37, 61.67, 120.9, 199.9, 298.6.
  bar: { k: 1.028, h: 0.08, ratios: [1, 2.756, 5.404, 8.933, 13.34] },
  // Free square plate, ν = 0.3 (Leissa, Vibration of Plates): λ = 13.47, 19.6, 24.3, 34.8, 61.1.
  plate: { k: 0.65, h: 0.03, ratios: [1, 1.46, 1.8, 2.58, 3.3, 4.53] },
  // Tuned bell partials, hum : prime : tierce : quint : nominal … (Rossing, Science of Sound).
  hollow: { k: 0.907, h: 0.077, ratios: [0.5, 1, 1.2, 1.5, 2, 2.5, 2.67, 3, 4] },
  // A chunky lump (brick, rock, block of wood): dense, quickly damped modes.
  block: { k: 1.028, h: 0.5, ratios: [1, 1.58, 2.1, 2.7, 3.4] },
};

export interface Strike {
  readonly modes: readonly Mode[];
  /** Contact cutoff, Hz. */
  readonly contact: number;
  /** Longest mode decay, s (amplitude e-folding). */
  readonly ring: number;
}

/** The modes a strike excites. Shared by impact, rattle and clunk. */
export function strike(
  a: Acoustic,
  shape: ImpactShape,
  size: number,
  thickness: number,
  mass: number,
  force: number,
  rng: Rng,
): Strike {
  const s = SHAPES[shape];
  const f1 = (s.k * waveSpeed(a) * thickness) / (size * size);
  const contact = (a.hardness * (0.4 + 0.6 * force)) / Math.sqrt(mass / 0.5);
  const modes: Mode[] = [];
  let ring = 0;
  s.ratios.forEach((r, n) => {
    const freq = f1 * r * (1 + rng.range(-0.007, 0.007));
    if (freq < 20 || freq > SAMPLE_RATE * 0.45) return;
    // Damping grows with frequency (air + thermoelastic): the attack is bright, the tail pure.
    const decay = Math.min(8, 1 / (Math.PI * freq * a.eta * (1 + freq / 8000)));
    const amp = rng.range(0.7, 1.3) / Math.sqrt(n + 1) / (1 + (freq / contact) ** 2);
    modes.push({ freq, amp, decay, phase: rng.range(0, Math.PI * 2) });
    ring = Math.max(ring, amp > 0.05 ? decay : 0);
  });
  return { modes, contact, ring };
}

/** Render a strike into `out` at sample `at`: modes plus a short low-passed contact noise. */
export function renderStrike(
  out: Float32Array,
  st: Strike,
  at: number,
  gain: number,
  seed: number,
) {
  addModes(out, st.modes, at, gain);
  const n = Math.max(8, Math.round((3 / st.contact) * SAMPLE_RATE));
  const click = biquad(noise(n, seed), 'lowpass', st.contact, 0.7);
  for (let i = 0; i < n; i++) click[i] = (click[i] ?? 0) * (1 - i / n) * 0.6;
  mixInto(out, click, at, gain);
}

export function impact(o: ImpactOptions): SoundClip {
  const a = acousticOf(o.material);
  const shape = o.shape ?? 'plate';
  const size = checkRange('impact size (m)', o.size, 0.005, 20, 'size: 0.3');
  const typical = size * SHAPES[shape].h;
  const thickness = checkRange(
    'impact thickness (m)',
    o.thickness ?? typical,
    0.0005,
    size,
    'thickness: 0.01',
  );
  const mass = checkRange('impact mass (kg)', o.mass ?? 0.5, 0.001, 10000, 'mass: 0.5');
  const force = checkRange('impact force', o.force ?? 0.7, 0, 1, 'force: 0.7');
  const max = checkRange('impact duration (s)', o.duration ?? 4, 0.05, 30, 'duration: 2');
  const seed = o.seed ?? 1;
  const st = strike(a, shape, size, thickness, mass, force, createRng(seed));
  // Long enough for the ring to fall 60 dB (6.9 e-folds), never longer than asked.
  const seconds = Math.min(max, Math.max(0.12, st.ring * 6.9));
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  renderStrike(out, st, 0, 1, seed + 1);
  const fade = Math.min(out.length, Math.round(0.01 * SAMPLE_RATE));
  for (let i = 0; i < fade; i++) {
    const k = out.length - fade + i;
    out[k] = (out[k] ?? 0) * (1 - i / fade);
  }
  normalize(out, 0.3 + 0.6 * force);
  const name =
    `impact_${a.id}_${shape}_${token(size)}` +
    variant([
      ['size', size, Math.round(size * 100) / 100],
      ['thick', thickness, typical],
      ['mass', mass, 0.5],
      ['force', force, 0.7],
      ['dur', max, 4],
      ['seed', seed, 1],
    ]);
  return makeClip(o.name ?? name, out);
}
