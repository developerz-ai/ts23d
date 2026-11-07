// Samples a signed-distance field on a cubic grid for the meshers. The field is clipped to the
// bounds box (max with the box's own distance), and the grid has a one-cell positive border, so
// every surface comes out closed. Sparse: one coarse sample per 8³-cell block; a block whose
// centre is farther from the surface than `lipschitz` × its half-diagonal cannot hold any of it,
// so its points take that sign without evaluating the field (a head at 4 mm meshes in ~1 s).

import type { Vec3 } from '../core/index.ts';
import { invalid } from './check.ts';
import type { Field } from './sdf-ops.ts';

export interface Grid {
  /** Points per axis. */
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  /** Position of point (0, 0, 0) and the cell edge, metres. */
  readonly origin: Vec3;
  readonly h: number;
  readonly values: Float32Array;
  /** The clipped field the grid sampled (normals take its gradient). */
  readonly field: Field;
}

/** Grid points above this are refused (≈ 80 MB of samples). */
export const MAX_POINTS = 1 << 24;
const BLOCK = 4;

export function sampleGrid(
  raw: Field,
  bounds: readonly [Vec3, Vec3],
  h: number,
  lipschitz: number,
  symmetricY = false,
): Grid {
  const [lo0, hi0] = bounds;
  if (!Number.isFinite(h) || h <= 0)
    invalid(
      `sdf resolution is ${h}`,
      'pass the cell edge in metres, e.g. ctx.pick([0.004, 0.012, 0.03])',
    );
  if (
    ![0, 1, 2].every((k) => Number.isFinite(lo0[k] ?? Number.NaN) && (hi0[k] ?? 0) > (lo0[k] ?? 0))
  )
    invalid(
      `sdf bounds [${lo0.join(', ')}] → [${hi0.join(', ')}] are empty or inverted`,
      'give bounds as [min, max] corners with max > min on every axis, in metres',
    );
  // Mirror-symmetric shapes: bounds ±m cells in y, so y = 0 is a grid plane and every sample
  // has its mirror twin at exactly (j − m − 1) · h — the mesh comes out symmetric.
  const m = Math.ceil(Math.max(Math.abs(lo0[1]), Math.abs(hi0[1])) / h);
  const lo: Vec3 = symmetricY ? [lo0[0], -m * h, lo0[2]] : lo0;
  const hi: Vec3 = symmetricY ? [hi0[0], m * h, hi0[2]] : hi0;
  const size = (k: number): number => Math.ceil(((hi[k] ?? 0) - (lo[k] ?? 0)) / h) + 3;
  const [nx, ny, nz] = [size(0), symmetricY ? 2 * m + 3 : size(1), size(2)];
  const yAt = (j: number): number => (symmetricY ? (j - m - 1) * h : lo[1] - h + j * h);
  if (nx * ny * nz > MAX_POINTS) {
    const vol = [0, 1, 2].reduce((v, k) => v * ((hi[k] ?? 0) - (lo[k] ?? 0)), 1);
    invalid(
      `sdf grid ${nx}×${ny}×${nz} exceeds ${MAX_POINTS} points at ${h} m cells`,
      `use cells ≥ ${Math.cbrt(vol / MAX_POINTS).toPrecision(2)} m, or tighten the bounds`,
    );
  }
  const cx = (lo[0] + hi[0]) / 2;
  const cy = (lo[1] + hi[1]) / 2;
  const cz = (lo[2] + hi[2]) / 2;
  const [bx, by, bz] = [(hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2];
  const field: Field = (p) => {
    const qx = Math.abs(p[0] - cx) - bx;
    const qy = Math.abs(p[1] - cy) - by;
    const qz = Math.abs(p[2] - cz) - bz;
    const box =
      Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) +
      Math.min(Math.max(qx, qy, qz), 0);
    const f = raw(p);
    if (Number.isNaN(f))
      invalid(
        `sdf field returned NaN at [${p.join(', ')}]`,
        'make the field return a finite distance everywhere in bounds',
      );
    return Math.max(f, box);
  };
  const origin: Vec3 = [lo[0] - h, symmetricY ? -(m + 1) * h : lo[1] - h, lo[2] - h];
  const values = new Float32Array(nx * ny * nz);
  const exact = new Uint8Array(nx * ny * nz);
  const [kx, ky, kz] = [
    Math.ceil((nx - 1) / BLOCK),
    Math.ceil((ny - 1) / BLOCK),
    Math.ceil((nz - 1) / BLOCK),
  ];
  const coarse = new Float32Array(kx * ky * kz);
  const p: [number, number, number] = [0, 0, 0];
  const floor = h * 0.01;
  const reach = lipschitz * BLOCK * h * Math.sqrt(3) * 0.5 + h;
  for (let k = 0; k < kz; k++)
    for (let j = 0; j < ky; j++)
      for (let i = 0; i < kx; i++) {
        p[0] = origin[0] + (i + 0.5) * BLOCK * h;
        p[1] = origin[1] + (j + 0.5) * BLOCK * h;
        p[2] = origin[2] + (k + 0.5) * BLOCK * h;
        const v = field(p);
        coarse[i + kx * (j + ky * k)] = v;
        if (Math.abs(v) > reach) continue;
        // Near the surface: every point of this block (faces included) is sampled exactly.
        for (let z = k * BLOCK; z <= Math.min(nz - 1, (k + 1) * BLOCK); z++)
          for (let y = j * BLOCK; y <= Math.min(ny - 1, (j + 1) * BLOCK); y++)
            for (let x = i * BLOCK; x <= Math.min(nx - 1, (i + 1) * BLOCK); x++)
              exact[x + nx * (y + ny * z)] = 1;
      }
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const id = x + nx * (y + ny * z);
        if (exact[id]) {
          p[0] = origin[0] + x * h;
          p[1] = yAt(y);
          p[2] = origin[2] + z * h;
          const f = field(p);
          // A sample (near) zero puts vertices of several cells on one grid point: marching cubes
          // then emits slivers. Keep |value| ≥ 1% of a cell (moves the surface ≤ h / 100).
          values[id] = Math.abs(f) >= floor ? f : f < 0 ? -floor : floor;
        } else {
          const b =
            Math.min(kx - 1, Math.floor(x / BLOCK)) +
            kx *
              (Math.min(ky - 1, Math.floor(y / BLOCK)) +
                ky * Math.min(kz - 1, Math.floor(z / BLOCK)));
          values[id] = coarse[b] ?? 1;
        }
      }
  return { nx, ny, nz, origin, h, values, field };
}
