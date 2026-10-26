// Bakes a part's Motion into a looping glTF animation sampler + channel.

import type { Motion } from '../core/index.ts';
import { quatFromAxisAngle } from '../core/index.ts';
import type { BinWriter, Json } from './bin-writer.ts';

const LOOP_SECONDS = 2;
const SAMPLES = 24;

export function motionChannel(
  bin: BinWriter,
  motion: Motion,
  node: number,
  rest: readonly number[],
): { sampler: Json; channel: Json } {
  const times = new Float32Array(SAMPLES + 1).map((_, i) => (i / SAMPLES) * LOOP_SECONDS);
  const input = bin.accessor(times, 'SCALAR', undefined, true);
  if (motion.kind === 'spin') {
    const values = new Float32Array((SAMPLES + 1) * 4);
    times.forEach((t, i) => {
      values.set(quatFromAxisAngle(motion.axis, t * motion.rps * Math.PI * 2), i * 4);
    });
    return {
      sampler: { input, output: bin.accessor(values, 'VEC4'), interpolation: 'LINEAR' },
      channel: { target: { node, path: 'rotation' } },
    };
  }
  const values = new Float32Array((SAMPLES + 1) * 3);
  times.forEach((t, i) => {
    const s = Math.sin(t * motion.hz * Math.PI * 2);
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
