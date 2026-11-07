// Meshers over a sampled grid (inside = value < 0). Both return positions + triangle indices
// wound CCW seen from outside; sdf.ts adds normals, UVs and colour.
//   nets:  naive surface nets — one vertex per surface cell (mean of its edge crossings), one quad
//          per sign-changing grid edge: triangles = 2 × crossing edges. Even, well-shaped
//          triangles, ~half of marching cubes' count, smooth by construction: the organic default.
//   cubes: marching cubes (Lorensen & Cline) — vertices on the grid edges, the classic table.

import { TRI } from './mc-table.ts';
import type { Grid } from './sdf-grid.ts';

export interface RawSurface {
  readonly pos: number[];
  readonly tris: number[];
}

// Cube corners (Bourke numbering) and the 12 edges as corner pairs.
const CORNER = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1];
const EDGE = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7];

export function surfaceNets(g: Grid): RawSurface {
  const { nx, ny, nz, values: v, h, origin: o } = g;
  const cells = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const pos: number[] = [];
  const c = new Float64Array(8);
  for (let z = 0; z < nz - 1; z++)
    for (let y = 0; y < ny - 1; y++)
      for (let x = 0; x < nx - 1; x++) {
        let mask = 0;
        for (let k = 0; k < 8; k++) {
          const val =
            v[
              x +
                (CORNER[k * 3] ?? 0) +
                nx * (y + (CORNER[k * 3 + 1] ?? 0) + ny * (z + (CORNER[k * 3 + 2] ?? 0)))
            ] ?? 1;
          c[k] = val;
          if (val < 0) mask |= 1 << k;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (let e = 0; e < 12; e++) {
          const a = EDGE[e * 2] ?? 0;
          const b = EDGE[e * 2 + 1] ?? 0;
          const va = c[a] ?? 0;
          const vb = c[b] ?? 0;
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          sx += (CORNER[a * 3] ?? 0) + t * ((CORNER[b * 3] ?? 0) - (CORNER[a * 3] ?? 0));
          sy +=
            (CORNER[a * 3 + 1] ?? 0) + t * ((CORNER[b * 3 + 1] ?? 0) - (CORNER[a * 3 + 1] ?? 0));
          sz +=
            (CORNER[a * 3 + 2] ?? 0) + t * ((CORNER[b * 3 + 2] ?? 0) - (CORNER[a * 3 + 2] ?? 0));
          n++;
        }
        cells[x + (nx - 1) * (y + (ny - 1) * z)] = pos.length / 3;
        pos.push(o[0] + (x + sx / n) * h, o[1] + (y + sy / n) * h, o[2] + (z + sz / n) * h);
      }
  const tris: number[] = [];
  const cell = (x: number, y: number, z: number): number =>
    cells[x + (nx - 1) * (y + (ny - 1) * z)] ?? 0;
  const P = (i: number, k: number): number => pos[i * 3 + k] ?? 0;
  /** Unit normal of triangle (a, b, c) written into n. */
  const n1 = new Float64Array(3);
  const n2 = new Float64Array(3);
  const normal = (a: number, b: number, c: number, n: Float64Array): void => {
    const ex = P(b, 0) - P(a, 0);
    const ey = P(b, 1) - P(a, 1);
    const ez = P(b, 2) - P(a, 2);
    const fx = P(c, 0) - P(a, 0);
    const fy = P(c, 1) - P(a, 1);
    const fz = P(c, 2) - P(a, 2);
    const x = ey * fz - ez * fy;
    const y = ez * fx - ex * fz;
    const z = ex * fy - ey * fx;
    const l = Math.sqrt(x * x + y * y + z * z) || 1;
    n[0] = x / l;
    n[1] = y / l;
    n[2] = z / l;
  };
  const flatness = (): number =>
    (n1[0] ?? 0) * (n2[0] ?? 0) + (n1[1] ?? 0) * (n2[1] ?? 0) + (n1[2] ?? 0) * (n2[2] ?? 0);
  const quad = (a: number, b: number, cc: number, d: number, out: boolean): void => {
    const [q0, q1, q2, q3] = out ? [a, b, cc, d] : [a, d, cc, b];
    // Split along the diagonal whose two triangles fold least (no creases on thin features).
    normal(q0, q1, q2, n1);
    normal(q0, q2, q3, n2);
    const along02 = flatness();
    normal(q0, q1, q3, n1);
    normal(q1, q2, q3, n2);
    if (along02 >= flatness()) tris.push(q0, q1, q2, q0, q2, q3);
    else tris.push(q0, q1, q3, q1, q2, q3);
  };
  for (let z = 1; z < nz - 1; z++)
    for (let y = 1; y < ny - 1; y++)
      for (let x = 1; x < nx - 1; x++) {
        const inside = (v[x + nx * (y + ny * z)] ?? 1) < 0;
        // Edge +X: cells around it in the (y, z) plane, CCW seen from +X.
        if (x < nx - 1 && inside !== (v[x + 1 + nx * (y + ny * z)] ?? 1) < 0)
          quad(cell(x, y - 1, z - 1), cell(x, y, z - 1), cell(x, y, z), cell(x, y - 1, z), inside);
        if (y < ny - 1 && inside !== (v[x + nx * (y + 1 + ny * z)] ?? 1) < 0)
          quad(cell(x - 1, y, z - 1), cell(x - 1, y, z), cell(x, y, z), cell(x, y, z - 1), inside);
        if (z < nz - 1 && inside !== (v[x + nx * (y + ny * (z + 1))] ?? 1) < 0)
          quad(cell(x - 1, y - 1, z), cell(x, y - 1, z), cell(x, y, z), cell(x - 1, y, z), inside);
      }
  return { pos, tris };
}

export function marchingCubes(g: Grid): RawSurface {
  const { nx, ny, nz, values: v, h, origin: o } = g;
  const shared = new Map<number, number>();
  const pos: number[] = [];
  const tris: number[] = [];
  for (let z = 0; z < nz - 1; z++)
    for (let y = 0; y < ny - 1; y++)
      for (let x = 0; x < nx - 1; x++) {
        let mask = 0;
        for (let k = 0; k < 8; k++)
          if (
            (v[
              x +
                (CORNER[k * 3] ?? 0) +
                nx * (y + (CORNER[k * 3 + 1] ?? 0) + ny * (z + (CORNER[k * 3 + 2] ?? 0)))
            ] ?? 1) < 0
          )
            mask |= 1 << k;
        const list = TRI[mask] ?? [];
        for (let t = 0; t < list.length; t += 3)
          for (const j of [0, 2, 1]) {
            const e = list[t + j] ?? 0;
            const a = EDGE[e * 2] ?? 0;
            const b = EDGE[e * 2 + 1] ?? 0;
            const ax = x + (CORNER[a * 3] ?? 0);
            const ay = y + (CORNER[a * 3 + 1] ?? 0);
            const az = z + (CORNER[a * 3 + 2] ?? 0);
            const bx = x + (CORNER[b * 3] ?? 0);
            const by = y + (CORNER[b * 3 + 1] ?? 0);
            const bz = z + (CORNER[b * 3 + 2] ?? 0);
            const ia = ax + nx * (ay + ny * az);
            const ib = bx + nx * (by + ny * bz);
            const lowId = Math.min(ia, ib);
            const key = lowId * 3 + (ax !== bx ? 0 : ay !== by ? 1 : 2);
            let id = shared.get(key);
            if (id === undefined) {
              const va = v[ia] ?? 0;
              const s = va / (va - (v[ib] ?? 0));
              id = pos.length / 3;
              pos.push(
                o[0] + (ax + s * (bx - ax)) * h,
                o[1] + (ay + s * (by - ay)) * h,
                o[2] + (az + s * (bz - az)) * h,
              );
              shared.set(key, id);
            }
            tris.push(id);
          }
      }
  return { pos, tris };
}
