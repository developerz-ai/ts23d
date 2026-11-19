// Writes a track belt's morph targets (tread-morphs.ts) into the GLB: POSITION and NORMAL deltas
// per target, the mesh's rest weights and target names, and the `weights` sampler of the `run`
// clip. Per pitch the keys step through the K phases, each target weighted by the hat round its
// own phase; one float32 step after the last key the weights are back at rest, which is the same
// picture (every link stands where its neighbour stood), so the wrap cannot be seen.

import { LOOP_SECONDS } from '../core/index.ts';
import type { BinWriter, Json } from './bin-writer.ts';
import { deltaAccessor } from './morph-targets.ts';
import type { TreadMorphs } from './tread-morphs.ts';

// The left and right belts of a vehicle are the same mesh moved sideways: their deltas are equal
// to the bit, so both meshes point at one set of accessors.
const written = new WeakMap<BinWriter, Map<string, { data: Float32Array; accessor: number }[]>>();

function shared(bin: BinWriter, data: Float32Array, bounds: boolean): number {
  let hash = 2166136261;
  const bits = new Uint32Array(data.buffer, data.byteOffset, data.length);
  for (const word of bits) hash = Math.imul(hash ^ word, 16777619);
  const key = `${bounds}:${data.length}:${hash >>> 0}`;
  const byKey = written.get(bin) ?? new Map<string, { data: Float32Array; accessor: number }[]>();
  written.set(bin, byKey);
  const same = byKey.get(key) ?? [];
  byKey.set(key, same);
  const hit = same.find((w) => w.data.every((v, i) => Object.is(v, data[i])));
  if (hit) return hit.accessor;
  const accessor = deltaAccessor(bin, data, { still: 0, bounds, dense: true });
  same.push({ data, accessor });
  return accessor;
}

/** The primitive's `targets`: POSITION and NORMAL per target. */
export function treadTargets(bin: BinWriter, m: TreadMorphs): Json[] {
  return m.targets.map((t) => ({
    POSITION: shared(bin, t.positions, true),
    NORMAL: shared(bin, t.normals, false),
  }));
}

/** Mesh-level default weights (rest) and target names. */
export const treadMeshFields = (m: TreadMorphs): Json => ({
  weights: m.targets.map(() => 0),
  extras: {
    targetNames: m.targets.map((t, j) =>
      j === 0 ? 'tread' : `tread_${Math.round(t.phase / t.reach)}_${Math.round(1 / t.reach)}`,
    ),
  },
});

/** The next float32 above `x` (x ≥ 0): the wrap key sits one step after the end of a pitch. */
function nextUp(x: number): number {
  const f = new Float32Array([x]);
  const bits = new Uint32Array(f.buffer);
  bits[0] = (bits[0] ?? 0) + 1;
  return f[0] ?? x;
}

/** The `weights` sampler of the run clip: `cycles` pitches, K + 1 LINEAR keys each. */
export function treadSampler(bin: BinWriter, m: TreadMorphs): Json {
  const k = m.targets.length;
  const keys = m.cycles * (k + 1);
  const times = new Float32Array(keys);
  const weights = new Float32Array(keys * k);
  for (let c = 0; c < m.cycles; c++)
    for (let j = 0; j <= k; j++) {
      const key = c * (k + 1) + j;
      const t = Math.fround(((c * k + j) / (m.cycles * k)) * LOOP_SECONDS);
      times[key] = j === 0 && c > 0 ? nextUp(t) : t;
      m.targets.forEach((target, i) => {
        weights[key * k + i] = Math.max(0, 1 - Math.abs(j / k - target.phase) / target.reach);
      });
    }
  return {
    input: bin.accessor(times, 'SCALAR', undefined, true),
    output: bin.accessor(weights, 'SCALAR'),
    interpolation: 'LINEAR',
  };
}
