// Bakes a part's Motion into glTF samplers + channels of the looping `run` clip, sampling
// core's motionPose (the same poses QA sweeps and assertFollows checks).
// Seamless by construction: every motion is rounded to a WHOLE number of cycles over the clip,
// so the last key equals the first (a 0.8 rps wheel over 4 s = 3 turns, not 3.2 — no jump at
// the loop point). Spins get ≥ 12 keys per turn so LINEAR quaternion interpolation never takes
// the short way round. Time arrays are shared between channels of equal key count. A tread has
// no channel (glTF cannot slide vertices round a loop): `treadExtras` hands its belt to engines.
// A rest yaw (a moving pivot re-parented past a merged, yawed parent) is kept: rotation keys are
// yaw ∘ motion, translation offsets turn by yaw, because axes and vectors are in the part's own frame.

import type { BakedMotion, Quat, Tread } from '../core/index.ts';
import { cyclesOf, LOOP_SECONDS, motionPaths, motionPose, rateOf, rotateZ } from '../core/index.ts';
import type { BinWriter, Json } from './bin-writer.ts';

export { cyclesOf, LOOP_SECONDS };

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

/** `extras.ts23d.tread` of a tread part: the belt loop (0.1 mm grid) and its repeat length. */
export const treadExtras = (t: Tread): Json => ({
  path: t.path.map((p) => p.map((v) => Math.round(v * 1e4) / 1e4)),
  pitch: t.pitch,
});

/** Rest yaw (about Z) applied after `q`: the Hamilton product yaw ⊗ q. */
function withYaw(q: Quat, yaw: number): Quat {
  if (yaw === 0) return q;
  const s = Math.sin(yaw / 2);
  const c = Math.cos(yaw / 2);
  const [x, y, z, w] = q;
  return [c * x - s * y, c * y + s * x, c * z + s * w, c * w - s * z];
}

/** Keys per cycle: slerped spins need 12; circles and linkages 48 (≤ 0.7 mm chord on a 0.3 m
 *  crank between LINEAR keys); slides and sways 16. */
const keysPerCycle = (m: BakedMotion): number =>
  m.kind === 'spin' ? 12 : m.kind === 'slide' || m.kind === 'sway' ? 16 : 48;

/** One sampler + channel per animated path: rotation for spin / sway, translation for slide /
 *  orbit / piston, both for a crank (the rod turns about its small end while that slides). */
export function motionChannels(
  bin: BinWriter,
  motion: BakedMotion,
  node: number,
  rest: readonly number[],
  yaw = 0,
): { sampler: Json; channel: Json }[] {
  const cycles = cyclesOf(rateOf(motion));
  const keys = Math.max(24, Math.abs(cycles) * keysPerCycle(motion));
  const { input, t } = times(bin, keys);
  const poses = [...t].map((time) => motionPose(motion, time));
  return motionPaths(motion).map((path) => {
    const width = path === 'translation' ? 3 : 4;
    const values = new Float32Array((keys + 1) * width);
    poses.forEach((pose, i) => {
      if (path === 'rotation') values.set(withYaw(pose.rotation, yaw), i * 4);
      else {
        const offset = yaw === 0 ? pose.offset : rotateZ(pose.offset, yaw);
        values.set(
          [0, 1, 2].map((k) => (rest[k] ?? 0) + (offset[k] ?? 0)),
          i * 3,
        );
      }
    });
    return {
      sampler: {
        input,
        output: bin.accessor(values, width === 3 ? 'VEC3' : 'VEC4'),
        interpolation: 'LINEAR',
      },
      channel: { target: { node, path } },
    };
  });
}
