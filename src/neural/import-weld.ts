// Exact-duplicate vertex weld for imported models: two vertices merge only when EVERY attribute
// (position, normal, UV, colour, joints, weights) is bit-identical, so UV seams, hard edges and
// skin weights survive untouched. `cleanMesh` welds by distance and re-winds; that would break a
// model's UVs and weights, so importModel uses this instead.

import type { Mesh } from '../core/index.ts';

export function weldExact(m: Mesh): Mesh {
  const n = m.positions.length / 3;
  const streams: [ArrayLike<number>, number][] = [
    [m.positions, 3],
    [m.normals, 3],
    [m.uvs, 2],
    [m.colors, 3],
    ...(m.joints && m.weights
      ? ([
          [m.joints, 4],
          [m.weights, 4],
        ] as [ArrayLike<number>, number][])
      : []),
  ];
  const first = new Map<string, number>();
  const remap = new Uint32Array(n);
  const keep: number[] = [];
  for (let v = 0; v < n; v++) {
    let key = '';
    for (const [data, w] of streams) for (let k = 0; k < w; k++) key += `${data[v * w + k]},`;
    let to = first.get(key);
    if (to === undefined) {
      to = keep.length;
      first.set(key, to);
      keep.push(v);
    }
    remap[v] = to;
  }
  if (keep.length === n) return m;
  const pick = <T extends Float32Array | Uint16Array>(src: T, w: number): T => {
    const out = src.slice(0, keep.length * w) as T;
    keep.forEach((v, i) => {
      for (let k = 0; k < w; k++) out[i * w + k] = src[v * w + k] ?? 0;
    });
    return out;
  };
  return {
    positions: pick(m.positions, 3),
    normals: pick(m.normals, 3),
    uvs: pick(m.uvs, 2),
    colors: pick(m.colors, 3),
    indices: m.indices.map((i) => remap[i] ?? 0),
    ...(m.joints && m.weights ? { joints: pick(m.joints, 4), weights: pick(m.weights, 4) } : {}),
  };
}
