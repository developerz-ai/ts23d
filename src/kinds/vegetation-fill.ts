// The far crown's last step (vegetation.ts): clamp the LOD2 cards into the LOD0 box and pull the
// extreme vertex onto every face of the box the crown falls short of, so LOD2 fills LOD0's bounds.

import type { Bounds, Mesh, Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';

type V3 = [number, number, number];
const sub = (a: Vec3, b: Vec3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/**
 * Clamp `m` into `box` and pull its extreme vertex onto every face of the box it falls short of.
 * A pulled vertex takes every copy at its position with it (a double-sided card's front and back,
 * D346), and the triangles that moved get their normals again.
 */
export function fillBox(m: Mesh, box: Bounds): Mesh {
  const positions = new Float32Array(m.positions);
  const n = positions.length / 3;
  const same = (i: number, j: number): boolean =>
    positions[i * 3] === positions[j * 3] &&
    positions[i * 3 + 1] === positions[j * 3 + 1] &&
    positions[i * 3 + 2] === positions[j * 3 + 2];
  const copies = (i: number, not: readonly number[] = []): number[] => {
    const out: number[] = [];
    for (let j = 0; j < n; j++) if (same(i, j) && !not.includes(j)) out.push(j);
    return out;
  };
  for (let k = 0; k < 3; k++) {
    const [lo, hi] = [box.min[k] ?? 0, box.max[k] ?? 0];
    let [iLo, iHi] = [-1, -1];
    for (let i = 0; i < n; i++) {
      const v = Math.min(hi, Math.max(lo, positions[i * 3 + k] ?? 0));
      positions[i * 3 + k] = v;
      if (iLo < 0 || v < (positions[iLo * 3 + k] ?? 0)) iLo = i;
    }
    if (iLo < 0) continue;
    const low = copies(iLo);
    // `>=`: on a mesh flat along this axis the two extremes are still two vertices.
    for (let i = 0; i < n; i++)
      if (
        !low.includes(i) &&
        (iHi < 0 || (positions[i * 3 + k] ?? 0) >= (positions[iHi * 3 + k] ?? 0))
      )
        iHi = i;
    const high = iHi < 0 ? [] : copies(iHi, low);
    for (const i of low) positions[i * 3 + k] = lo;
    for (const i of high) positions[i * 3 + k] = hi;
  }
  return { ...m, positions, normals: renormal(m, positions) };
}

/** `m`'s normals, recomputed (area-weighted) on the vertices of triangles that moved. */
function renormal(m: Mesh, positions: Float32Array): Float32Array {
  const normals = new Float32Array(m.normals);
  const moved = (i: number): boolean =>
    [0, 1, 2].some((k) => positions[i * 3 + k] !== m.positions[i * 3 + k]);
  const sum = new Map<number, [number, number, number]>();
  const at = (i: number): V3 => [
    positions[i * 3] ?? 0,
    positions[i * 3 + 1] ?? 0,
    positions[i * 3 + 2] ?? 0,
  ];
  for (let t = 0; t < m.indices.length; t += 3) {
    const tri = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
    if (!tri.some(moved)) continue;
    const [a, b, c] = tri.map(at) as [V3, V3, V3];
    const [u, v] = [sub(b, a), sub(c, a)];
    const f: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const i of tri) {
      const s = sum.get(i) ?? [0, 0, 0];
      sum.set(i, [s[0] + f[0], s[1] + f[1], s[2] + f[2]]);
    }
  }
  for (const [i, s] of sum) {
    const l = dmath.norm(s);
    if (l > 0) for (let k = 0; k < 3; k++) normals[i * 3 + k] = (s[k] ?? 0) / l;
  }
  return normals;
}
