// Morph targets for glTF: one POSITION target per `Mesh.morphs` entry as a SPARSE accessor (only
// the vertices that move are stored; a blink touches the lids, not the whole body), the mesh's
// default `weights` (all 0 = rest) and `extras.targetNames` (the de-facto name list three.js,
// Blender and Babylon read). Clips key the weights through clips.ts. A track belt's targets
// (tread-morphs.ts) use the same accessor writer, dense where nearly every vertex moves.

import type { Mesh } from '../core/index.ts';
import { ARRAY_BUFFER, type BinWriter, type Json } from './bin-writer.ts';

const FLOAT = 5126;
const UINT16 = 5123;
const UINT32 = 5125;

/** A morph delta below this (metres) is stored as zero: float noise, not a shape. */
const STILL = 1e-7;

export interface DeltaOptions {
  /** A component at or below this is no movement (default `STILL`). */
  readonly still?: number;
  /** Write `min` / `max` (glTF requires them on POSITION, default true). */
  readonly bounds?: boolean;
  /** Store every vertex when that is smaller than indices + values (default false: sparse). */
  readonly dense?: boolean;
}

/** A VEC3 delta-per-vertex accessor (a morph target's POSITION or NORMAL), sparse by default. */
export function deltaAccessor(bin: BinWriter, delta: Float32Array, o: DeltaOptions = {}): number {
  const still = o.still ?? STILL;
  const count = delta.length / 3;
  const moved: number[] = [];
  // glTF: min / max are the extrema of the values the accessor holds. A still vertex holds 0
  // (written dense, or left at a sparse accessor's zero base); when every vertex moves, none does.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < count; v++) {
    let any = false;
    for (let k = 0; k < 3; k++) {
      const d = delta[v * 3 + k] ?? 0;
      if (Math.abs(d) > still) any = true;
    }
    if (!any) continue;
    moved.push(v);
    for (let k = 0; k < 3; k++) {
      const d = Math.fround(delta[v * 3 + k] ?? 0);
      if (d < (min[k] ?? 0)) min[k] = d;
      if (d > (max[k] ?? 0)) max[k] = d;
    }
  }
  const zero = moved.length < count || count === 0;
  const bounds =
    o.bounds === false
      ? {}
      : {
          min: min.map((m) => (zero ? Math.min(m, 0) : m)),
          max: max.map((m) => (zero ? Math.max(m, 0) : m)),
        };
  const wide = count > 65535;
  if (o.dense && moved.length * (wide ? 16 : 14) > count * 12) {
    // Still vertices are written as exact zeros, the zero `bounds` above counts.
    const all = new Float32Array(delta.length);
    for (const v of moved) all.set(delta.subarray(v * 3, v * 3 + 3), v * 3);
    const dense = bin.accessor(all, 'VEC3', ARRAY_BUFFER);
    Object.assign(bin.accessors[dense] ?? {}, bounds);
    return dense;
  }
  const acc: Json = { componentType: FLOAT, count, type: 'VEC3', ...bounds };
  if (moved.length) {
    const indices = wide ? Uint32Array.from(moved) : Uint16Array.from(moved);
    const values = new Float32Array(moved.length * 3);
    moved.forEach((v, i) => {
      values.set(delta.subarray(v * 3, v * 3 + 3), i * 3);
    });
    acc['sparse'] = {
      count: moved.length,
      indices: { bufferView: bin.view(indices), componentType: wide ? UINT32 : UINT16 },
      values: { bufferView: bin.view(values) },
    };
  }
  bin.accessors.push(acc);
  return bin.accessors.length - 1;
}

/** Primitive `targets` (none for a mesh without morphs). */
export function morphTargets(bin: BinWriter, m: Mesh): Json {
  if (!m.morphs?.length) return {};
  return { targets: m.morphs.map((t) => ({ POSITION: deltaAccessor(bin, t.positions) })) };
}

/** Mesh-level default weights + target names. */
export function morphMeshFields(m: Mesh | null): Json {
  if (!m?.morphs?.length) return {};
  return {
    weights: m.morphs.map(() => 0),
    extras: { targetNames: m.morphs.map((t) => t.name) },
  };
}
