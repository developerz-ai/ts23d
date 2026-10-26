// Bakes a part's Motion into one glTF sampler + channel of the looping `run` clip.
// Seamless by construction: every motion is rounded to a WHOLE number of cycles over the clip,
// so the last key equals the first (a 0.8 rps wheel over 4 s = 3 turns, not 3.2 — no jump at
// the loop point). Spins get ≥ 12 keys per turn so LINEAR quaternion interpolation never takes
// the short way round. Time arrays are shared between channels of equal key count.

import type { Motion } from '../core/index.ts';
import { quatFromAxisAngle } from '../core/index.ts';
import type { BinWriter, Json } from './bin-writer.ts';

export const LOOP_SECONDS = 4;

/** Whole cycles of `rate` (Hz or rev/s) over the clip, at least one. */
export const cyclesOf = (rate: number): number =>
  Math.max(1, Math.round(Math.abs(rate) * LOOP_SECONDS)) * Math.sign(rate || 1);

const timeAccessors = new WeakMap<BinWriter, Map<number, number>>();
function times(bin: BinWriter, keys: number): { input: number; t: Float32Array } {
  const t = new Float32Array(keys + 1).map((_, i) => (i / keys) * LOOP_SECONDS);
  const byBin = timeAccessors.get(bin) ?? new Map<number, number>();
  timeAccessors.set(bin, byBin);
  let input = byBin.get(keys);
  if (input === undefined) {
    input = bin.accessor(t, 'SCALAR', undefined, true);
    byBin.set(keys, input);
  }
  return { input, t };
}

export function motionChannel(
  bin: BinWriter,
  motion: Motion,
  node: number,
  rest: readonly number[],
): { sampler: Json; channel: Json } {
  const rate = motion.kind === 'spin' ? motion.rps : motion.hz;
  const cycles = cyclesOf(rate);
  const keys = Math.max(24, Math.abs(cycles) * (motion.kind === 'spin' ? 12 : 16));
  const { input, t } = times(bin, keys);
  const phase = (time: number): number => (time / LOOP_SECONDS) * cycles * Math.PI * 2;
  if (motion.kind === 'slide') {
    const values = new Float32Array((keys + 1) * 3);
    t.forEach((time, i) => {
      const s = Math.sin(phase(time));
      values.set(
        [0, 1, 2].map((k) => (rest[k] ?? 0) + (motion.offset[k] ?? 0) * s),
        i * 3,
      );
    });
    return {
      sampler: { input, output: bin.accessor(values, 'VEC3'), interpolation: 'LINEAR' },
      channel: { target: { node, path: 'translation' } },
    };
  }
  const values = new Float32Array((keys + 1) * 4);
  const peak = motion.kind === 'sway' ? (motion.degrees * Math.PI) / 180 : 0;
  t.forEach((time, i) => {
    const angle = motion.kind === 'spin' ? phase(time) : peak * Math.sin(phase(time));
    values.set(quatFromAxisAngle(motion.axis, angle), i * 4);
  });
  return {
    sampler: { input, output: bin.accessor(values, 'VEC4'), interpolation: 'LINEAR' },
    channel: { target: { node, path: 'rotation' } },
  };
}
