// The far (LOD2) brick at true scale. The library's LOD2 roof and walls stretch one band of the
// brick strip over a whole face (V squeezed), so the courses streak down the wall like red timber
// planks. The far walls take the mid LOD's banded faces instead (`mass` at LOD1: the same quads
// cut at every 0.45 m strip band), and the far roof keeps its bare slopes but swaps its two gable
// walls for the banded ones of the LOD1 roof: a few dozen triangles for brick that reads as brick,
// paid for by the far windows and doors keeping only their face (`faceOnly`): the 2-5 cm sides of
// a glass or door plate on the wall are not a pixel at that distance.

import { type Mesh, merge, type RoofMeshOptions, roofMesh, type Vec3 } from '@developerz.ai/ts23d';

/** The triangles of `m` that `keep` accepts, as a compact mesh. */
function filterTriangles(m: Mesh, keep: (a: number, b: number, c: number) => boolean): Mesh {
  const remap = new Int32Array(m.positions.length / 3).fill(-1);
  const order: number[] = [];
  const idx: number[] = [];
  for (let t = 0; t < m.indices.length; t += 3) {
    const tri = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0] as const;
    if (!keep(...tri)) continue;
    for (const v of tri) {
      if ((remap[v] ?? -1) < 0) {
        remap[v] = order.length;
        order.push(v);
      }
      idx.push(remap[v] ?? 0);
    }
  }
  const pick = (a: Float32Array, k: number): Float32Array => {
    const out = new Float32Array(order.length * k);
    for (const [i, v] of order.entries()) out.set(a.subarray(v * k, v * k + k), i * k);
    return out;
  };
  return {
    positions: pick(m.positions, 3),
    normals: pick(m.normals, 3),
    uvs: pick(m.uvs, 2),
    colors: pick(m.colors, 3),
    indices: Uint32Array.from(idx),
  };
}

/**
 * The far roof: LOD2's bare slopes and stacks, with the gable infill (the brick triangles in the
 * end-wall planes y = ±`gableY`) taken from the LOD1 roof, cut into true-scale course bands.
 */
export function farRoof(o: RoofMeshOptions, gableY: number): Mesh {
  const gable =
    (m: Mesh) =>
    (...tri: readonly number[]): boolean =>
      tri.every(
        (v) =>
          Math.abs(Math.abs(m.positions[v * 3 + 1] ?? 0) - gableY) < 1e-3 &&
          Math.abs(m.normals[v * 3 + 1] ?? 0) > 0.99,
      );
  const far = roofMesh(o, 2);
  const mid = roofMesh(o, 1);
  const farGable = gable(far);
  return merge([
    filterTriangles(far, (a, b, c) => !farGable(a, b, c)),
    filterTriangles(mid, gable(mid)),
  ]);
}

/** Only the triangles of `m` facing `out` (a plate's front face, without its thin sides). */
export function faceOnly(m: Mesh, out: Vec3): Mesh {
  const facing = (v: number): boolean =>
    (m.normals[v * 3] ?? 0) * out[0] +
      (m.normals[v * 3 + 1] ?? 0) * out[1] +
      (m.normals[v * 3 + 2] ?? 0) * out[2] >
    0.9;
  return filterTriangles(m, (a, b, c) => facing(a) && facing(b) && facing(c));
}
