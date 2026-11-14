// definePart's placement helpers: a piece's mesh moved to its pivot (for merging), and a whole
// piece re-oriented by a Placement — mesh, pivot and motion axis together, so a hinge laid on its
// side still swings about its pin.

import type { PartPiece } from './define-part.ts';
import type { Mesh } from './mesh.ts';
import type { Motion } from './part.ts';
import { type Affine, affine, applyAffine } from './transform.ts';
import type { Vec3 } from './vec.ts';

const linear = (a: Affine, v: Vec3): Vec3 => [
  a.m[0] * v[0] + a.m[1] * v[1] + a.m[2] * v[2],
  a.m[3] * v[0] + a.m[4] * v[1] + a.m[5] * v[2],
  a.m[6] * v[0] + a.m[7] * v[1] + a.m[8] * v[2],
];
const point = (a: Affine, v: Vec3): Vec3 => {
  const l = linear(a, v);
  return [l[0] + a.t[0], l[1] + a.t[1], l[2] + a.t[2]];
};

/** The piece's mesh in the part's space (offset by its pivot), or nothing for a bare pivot. */
export function pieceMesh(pc: PartPiece): Mesh[] {
  if (!pc.mesh) return [];
  return [pc.at ? applyAffine(pc.mesh, affine({ at: pc.at })) : pc.mesh];
}

/** A whole one-mesh part through a placement (rotation, scale and offset baked in). */
export const placedMesh = (m: Mesh, place: Parameters<typeof affine>[0]): Mesh =>
  applyAffine(m, affine(place));

const det = (a: Affine): number =>
  a.m[0] * (a.m[4] * a.m[8] - a.m[5] * a.m[7]) -
  a.m[1] * (a.m[3] * a.m[8] - a.m[5] * a.m[6]) +
  a.m[2] * (a.m[3] * a.m[7] - a.m[4] * a.m[6]);

/**
 * Offsets and paths are vectors: they map through the linear part. A rotation axis is a pseudo-
 * vector: a mirror (det < 0) flips the turning sense, so the axis is negated to keep the swing the
 * mirror image of the original. Normalised, so a scaled placement keeps `degrees` meaningful.
 */
function rotateMotion(m: Motion, a: Affine): Motion {
  if (m.kind === 'slide') return { ...m, offset: linear(a, m.offset) };
  if (m.kind === 'tread') return { ...m, path: m.path.map((p) => linear(a, p)) };
  const v = linear(a, m.axis);
  const k = Math.sign(det(a)) / (Math.hypot(...v) || 1);
  // + 0 turns -0 into 0, so a mirrored [0, 0, 1] reads [0, 0, -1] in manifests.
  return { ...m, axis: [v[0] * k + 0, v[1] * k + 0, v[2] * k + 0] };
}

/**
 * Re-orient a piece: the pivot moves through the full placement; the mesh (authored about its
 * pivot) and the motion axis get the rotation/scale only.
 */
export function placePiece(pc: PartPiece, place: Parameters<typeof affine>[0]): PartPiece {
  const full = affine(place);
  const rot: Affine = { m: full.m, t: [0, 0, 0] };
  const at = point(full, pc.at ?? [0, 0, 0]);
  return {
    ...pc,
    mesh: pc.mesh ? applyAffine(pc.mesh, rot) : null,
    at,
    ...(pc.motion ? { motion: rotateMotion(pc.motion, rot) } : {}),
  };
}
