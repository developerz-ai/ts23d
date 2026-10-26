// Rigid transforms on meshes: place a sub-mesh anywhere at any orientation, then merge. This is
// how detail is authored — build a rivet/hatch/bracket once in local space, place it N times.

import type { Mesh } from './mesh.ts';
import type { Vec3 } from './vec.ts';

/** Row-major 3×3 rotation(·scale) + translation. */
export interface Affine {
  readonly m: readonly [number, number, number, number, number, number, number, number, number];
  readonly t: Vec3;
}

export interface Placement {
  readonly at?: Vec3;
  /** Radians about Z (heading), then Y (pitch), then X (roll). */
  readonly yaw?: number;
  readonly pitch?: number;
  readonly roll?: number;
  readonly scale?: number | Vec3;
}

export function affine(p: Placement): Affine {
  const [cy, sy] = [Math.cos(p.yaw ?? 0), Math.sin(p.yaw ?? 0)];
  const [cp, sp] = [Math.cos(p.pitch ?? 0), Math.sin(p.pitch ?? 0)];
  const [cr, sr] = [Math.cos(p.roll ?? 0), Math.sin(p.roll ?? 0)];
  const [kx, ky, kz]: Vec3 =
    typeof p.scale === 'number' ? [p.scale, p.scale, p.scale] : (p.scale ?? [1, 1, 1]);
  // R = Rz(yaw) · Ry(pitch) · Rx(roll), columns scaled by (kx, ky, kz).
  return {
    m: [
      cy * cp * kx,
      (cy * sp * sr - sy * cr) * ky,
      (cy * sp * cr + sy * sr) * kz,
      sy * cp * kx,
      (sy * sp * sr + cy * cr) * ky,
      (sy * sp * cr - cy * sr) * kz,
      -sp * kx,
      cp * sr * ky,
      cp * cr * kz,
    ],
    t: p.at ?? [0, 0, 0],
  };
}

/** A basis from an explicit frame: local X→u, Y→v, Z→w (all world vectors). */
export const frame = (u: Vec3, v: Vec3, w: Vec3, at: Vec3 = [0, 0, 0]): Affine => ({
  m: [u[0], v[0], w[0], u[1], v[1], w[1], u[2], v[2], w[2]],
  t: at,
});

export function applyAffine(mesh: Mesh, a: Affine): Mesh {
  const { m, t } = a;
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = mesh.positions[i] ?? 0;
    const y = mesh.positions[i + 1] ?? 0;
    const z = mesh.positions[i + 2] ?? 0;
    positions[i] = m[0] * x + m[1] * y + m[2] * z + t[0];
    positions[i + 1] = m[3] * x + m[4] * y + m[5] * z + t[1];
    positions[i + 2] = m[6] * x + m[7] * y + m[8] * z + t[2];
    const nx = mesh.normals[i] ?? 0;
    const ny = mesh.normals[i + 1] ?? 0;
    const nz = mesh.normals[i + 2] ?? 0;
    // Rigid + uniform scale: rotating the normal and renormalising is exact.
    const rx = m[0] * nx + m[1] * ny + m[2] * nz;
    const ry = m[3] * nx + m[4] * ny + m[5] * nz;
    const rz = m[6] * nx + m[7] * ny + m[8] * nz;
    const l = Math.hypot(rx, ry, rz) || 1;
    normals[i] = rx / l;
    normals[i + 1] = ry / l;
    normals[i + 2] = rz / l;
  }
  return { ...mesh, positions, normals };
}

export const place = (mesh: Mesh, p: Placement): Mesh => applyAffine(mesh, affine(p));
