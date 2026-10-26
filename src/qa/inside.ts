// Point-in-solid for closed meshes, indexed and allocation-free: axis-aligned rays (+Z, +Y, +X)
// against triangles bucketed in a 2D grid perpendicular to each ray. An axis-aligned ray hitting a
// triangle is a 2D point-in-triangle test in the other two axes plus one interpolated depth.
// Majority of the three rays (short-circuited), so grazing an edge cannot flip the answer.
// Open sheets (planar decals) are never "solid"; penetration only means something vs closed parts.

import type { Mesh, Vec3 } from '../core/index.ts';

const CELL = 0.2;
// A tiny fixed offset keeps the query point off shared edges/vertices of axis-aligned geometry.
const NUDGE: Vec3 = [1.37e-5, 2.91e-5, 3.73e-5];
const OTHER = [
  [1, 2],
  [0, 2],
  [0, 1],
] as const;

export class SolidIndex {
  private readonly tri: Float64Array;
  private readonly columns: Map<number, number[]>[] = [new Map(), new Map(), new Map()];

  constructor(mesh: Mesh) {
    const n = mesh.indices.length / 3;
    this.tri = new Float64Array(n * 9);
    for (let t = 0; t < n; t++) {
      for (let v = 0; v < 3; v++) {
        const idx = mesh.indices[t * 3 + v] ?? 0;
        for (let k = 0; k < 3; k++) this.tri[t * 9 + v * 3 + k] = mesh.positions[idx * 3 + k] ?? 0;
      }
      for (const axis of [0, 1, 2] as const) {
        const [i, j] = OTHER[axis];
        const T = this.tri;
        const o = t * 9;
        const ui = [T[o + i] ?? 0, T[o + 3 + i] ?? 0, T[o + 6 + i] ?? 0];
        const uj = [T[o + j] ?? 0, T[o + 3 + j] ?? 0, T[o + 6 + j] ?? 0];
        const u0 = Math.floor(Math.min(...ui) / CELL);
        const u1 = Math.floor(Math.max(...ui) / CELL);
        const v0 = Math.floor(Math.min(...uj) / CELL);
        const v1 = Math.floor(Math.max(...uj) / CELL);
        const map = this.columns[axis];
        if (!map) continue;
        for (let u = u0; u <= u1; u++)
          for (let v = v0; v <= v1; v++) {
            const k = (u * 92837111) ^ (v * 689287499);
            const list = map.get(k);
            if (list) list.push(t);
            else map.set(k, [t]);
          }
      }
    }
  }

  /** Odd number of crossings of the ray from p along +axis ⇒ inside (for that ray). */
  private parity(px: number, py: number, pz: number, axis: 0 | 1 | 2): boolean {
    const [i, j] = OTHER[axis];
    const p = [px, py, pz];
    const pi = p[i] ?? 0;
    const pj = p[j] ?? 0;
    const pk = p[axis] ?? 0;
    const list = this.columns[axis]?.get(
      (Math.floor(pi / CELL) * 92837111) ^ (Math.floor(pj / CELL) * 689287499),
    );
    if (!list) return false;
    const T = this.tri;
    let n = 0;
    for (const t of list) {
      const o = t * 9;
      const ai = T[o + i] ?? 0;
      const aj = T[o + j] ?? 0;
      const bi = T[o + 3 + i] ?? 0;
      const bj = T[o + 3 + j] ?? 0;
      const ci = T[o + 6 + i] ?? 0;
      const cj = T[o + 6 + j] ?? 0;
      const area = (bi - ai) * (cj - aj) - (bj - aj) * (ci - ai);
      if (Math.abs(area) < 1e-14) continue;
      const w0 = ((bi - pi) * (cj - pj) - (bj - pj) * (ci - pi)) / area;
      const w1 = ((ci - pi) * (aj - pj) - (cj - pj) * (ai - pi)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const depth =
        w0 * (T[o + axis] ?? 0) + w1 * (T[o + 3 + axis] ?? 0) + w2 * (T[o + 6 + axis] ?? 0);
      if (depth > pk) n++;
    }
    return n % 2 === 1;
  }

  inside(point: Vec3): boolean {
    const x = point[0] + NUDGE[0];
    const y = point[1] + NUDGE[1];
    const z = point[2] + NUDGE[2];
    const vz = this.parity(x, y, z, 2);
    const vy = this.parity(x, y, z, 1);
    return vz === vy ? vz : this.parity(x, y, z, 0);
  }
}

/** One-off query; build a SolidIndex yourself when testing many points against one mesh. */
export const insideSolid = (p: Vec3, m: Mesh): boolean => new SolidIndex(m).inside(p);
