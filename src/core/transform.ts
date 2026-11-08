// Affine transforms on meshes (normals by the inverse transpose): place a sub-mesh anywhere at any orientation, then merge. This is
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

/**
 * The matrix that carries normals: M itself when M is a rotation times a uniform scale (exact,
 * and the historical bytes), else sign(det)·cof(M) = |det|·M⁻ᵀ (the inverse transpose without an
 * inversion, still pointing outward through a mirror). Normalised per vertex either way.
 */
export function normalMatrix(m: Affine['m']): Affine['m'] {
  const c0 = m[0] * m[0] + m[3] * m[3] + m[6] * m[6];
  const c1 = m[1] * m[1] + m[4] * m[4] + m[7] * m[7];
  const c2 = m[2] * m[2] + m[5] * m[5] + m[8] * m[8];
  const d01 = m[0] * m[1] + m[3] * m[4] + m[6] * m[7];
  const d02 = m[0] * m[2] + m[3] * m[5] + m[6] * m[8];
  const d12 = m[1] * m[2] + m[4] * m[5] + m[7] * m[8];
  const tol = 1e-9 * Math.max(c0, c1, c2);
  const similar =
    Math.abs(c0 - c1) <= tol &&
    Math.abs(c0 - c2) <= tol &&
    Math.abs(d01) <= tol &&
    Math.abs(d02) <= tol &&
    Math.abs(d12) <= tol;
  if (similar) return m;
  const s = determinant(m) < 0 ? -1 : 1;
  return [
    s * (m[4] * m[8] - m[5] * m[7]),
    s * (m[5] * m[6] - m[3] * m[8]),
    s * (m[3] * m[7] - m[4] * m[6]),
    s * (m[2] * m[7] - m[1] * m[8]),
    s * (m[0] * m[8] - m[2] * m[6]),
    s * (m[1] * m[6] - m[0] * m[7]),
    s * (m[1] * m[5] - m[2] * m[4]),
    s * (m[2] * m[3] - m[0] * m[5]),
    s * (m[0] * m[4] - m[1] * m[3]),
  ];
}

const determinant = (m: Affine['m']): number =>
  m[0] * (m[4] * m[8] - m[5] * m[7]) -
  m[1] * (m[3] * m[8] - m[5] * m[6]) +
  m[2] * (m[3] * m[7] - m[4] * m[6]);

export function applyAffine(mesh: Mesh, a: Affine): Mesh {
  const { m, t } = a;
  const k = normalMatrix(m);
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
    const rx = k[0] * nx + k[1] * ny + k[2] * nz;
    const ry = k[3] * nx + k[4] * ny + k[5] * nz;
    const rz = k[6] * nx + k[7] * ny + k[8] * nz;
    const l = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
    normals[i] = rx / l;
    normals[i + 1] = ry / l;
    normals[i + 2] = rz / l;
  }
  // A mirror (det < 0) turns counter-clockwise triangles clockwise: flip each one back, or
  // engines cull the outside and draw the inside.
  if (determinant(m) >= 0) return { ...mesh, positions, normals };
  const indices = mesh.indices.slice();
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const b = indices[t + 1] ?? 0;
    indices[t + 1] = indices[t + 2] ?? 0;
    indices[t + 2] = b;
  }
  return { ...mesh, positions, normals, indices };
}

export const place = (mesh: Mesh, p: Placement): Mesh => applyAffine(mesh, affine(p));
