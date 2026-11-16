// Morph targets for glTF: one POSITION target per `Mesh.morphs` entry as a SPARSE accessor (only
// the vertices that move are stored; a blink touches the lids, not the whole body), the mesh's
// default `weights` (all 0 = rest) and `extras.targetNames` (the de-facto name list three.js,
// Blender and Babylon read). Clips key the weights through clips.ts.

import type { Mesh } from '../core/index.ts';
import type { BinWriter, Json } from './bin-writer.ts';

const FLOAT = 5126;
const UINT16 = 5123;
const UINT32 = 5125;

/** A morph delta below this (metres) is stored as zero: float noise, not a shape. */
const STILL = 1e-7;

function sparseTarget(bin: BinWriter, delta: Float32Array): number {
  const count = delta.length / 3;
  const moved: number[] = [];
  const min = [0, 0, 0];
  const max = [0, 0, 0];
  for (let v = 0; v < count; v++) {
    let any = false;
    for (let k = 0; k < 3; k++) {
      const d = delta[v * 3 + k] ?? 0;
      if (Math.abs(d) > STILL) any = true;
    }
    if (!any) continue;
    moved.push(v);
    for (let k = 0; k < 3; k++) {
      const d = Math.fround(delta[v * 3 + k] ?? 0);
      if (d < (min[k] ?? 0)) min[k] = d;
      if (d > (max[k] ?? 0)) max[k] = d;
    }
  }
  const acc: Json = { componentType: FLOAT, count, type: 'VEC3', min, max };
  if (moved.length) {
    const wide = count > 65535;
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
  return { targets: m.morphs.map((t) => ({ POSITION: sparseTarget(bin, t.positions) })) };
}

/** Mesh-level default weights + target names. */
export function morphMeshFields(m: Mesh | null): Json {
  if (!m?.morphs?.length) return {};
  return {
    weights: m.morphs.map(() => 0),
    extras: { targetNames: m.morphs.map((t) => t.name) },
  };
}
