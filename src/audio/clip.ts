// Clip assembly and input checks shared by every generator: the sample rate, a named SoundClip
// from a Float32Array, peak normalisation, and the `T3D_AUDIO_INVALID` guards on numbers/names.

import { type SoundClip, Ts23dError } from '../core/index.ts';

/** Every clip renders at 48 kHz (the game-audio standard rate). */
export const SAMPLE_RATE = 48000;

/** Throws T3D_AUDIO_INVALID unless `v` is finite and within [min, max]. Returns `v`. */
export function checkRange(what: string, v: number, min: number, max: number, eg: string): number {
  if (!Number.isFinite(v) || v < min || v > max)
    throw new Ts23dError('T3D_AUDIO_INVALID', {
      cause: `${what} is ${v}, outside ${min}..${max}`,
      fix: `pass a number in range, e.g. ${eg}`,
    });
  return v;
}

/** Clip names become `<name>.wav`: snake_case only. */
export function checkName(name: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(name))
    throw new Ts23dError('T3D_AUDIO_INVALID', {
      cause: `sound name '${name}' is not snake_case`,
      fix: "name it [a-z][a-z0-9_]* — it becomes the WAV file name, e.g. name: 'door_creak'",
    });
  return name;
}

/** A metre / rpm value as a name-safe token: 0.35 → '0_35'. */
export const token = (v: number): string =>
  String(Math.round(v * 100) / 100)
    .replace('.', '_')
    .replace('-', 'm');

/** An option value spelled exactly, name-safe: 0.301 → '0_301', -2 → 'm2'. */
const exact = (v: number): string => String(v).replace('.', '_').replace('-', 'm').replace('+', '');

/**
 * Name suffix `_<key><value>` for every option that differs from its default, in the order given:
 * two variants of one generator never share a default name, and all-default options add nothing
 * (so existing default names stay put).
 */
export function variant(
  options: readonly (readonly [key: string, value: number, def: number])[],
): string {
  return options.map(([k, v, d]) => (v === d ? '' : `_${k}${exact(v)}`)).join('');
}

/** Scale so the loudest sample sits at `peak` (silence stays silence). In place; returns `x`. */
export function normalize(x: Float32Array, peak = 0.89): Float32Array {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i] ?? 0));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] = ((x[i] ?? 0) / m) * peak;
  return x;
}

export function makeClip(name: string, samples: Float32Array, loop = false): SoundClip {
  return { name: checkName(name), sampleRate: SAMPLE_RATE, channels: 1, samples, loop };
}

/** Seconds of audio in a clip. */
export const durationOf = (clip: SoundClip): number =>
  clip.samples.length / clip.channels / clip.sampleRate;
