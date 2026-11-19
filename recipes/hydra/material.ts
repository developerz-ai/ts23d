// The hydra's two strips. `hydra_scales`: overlapping reptile scales in true metres (a monitor's
// dorsal scales scaled up to the body, 6 × 4.5 cm), crowns lighter and glossier than the grooves,
// near-white so the vertex colour carries the pattern. Keratin (horns, claws, teeth, spines) sits on
// the built-in satin strip; pieces take their UVs from `pinKeratin`, along their own length.

import {
  defineMaterial,
  type Mesh,
  type StripId,
  stripRect,
  tex,
  type Vec3,
} from '@developerz.ai/ts23d';

/** Height of a scale strip's row, metres: the body plan's `uvBands` fit one row round this much skin. */
export const SCALE_ROW = 0.3;

const scaleStamp = tex.scales({ width: 0.06, height: 0.045, overlap: 0.42, point: 0.25, seed: 11 });
const scaleH = scaleStamp.height
  .mul(0.85)
  .add(tex.noise({ size: 0.01, octaves: 2, seed: 12 }).mul(0.15));

export const SCALES = defineMaterial({
  id: 'hydra_scales',
  // Pinned off its hash row (10). Rows are per asset now, so this only keeps the scales' row
  // stable; `bun scripts/material-rows.ts` lists who holds which.
  row: 11,
  scaleMetres: SCALE_ROW,
  spanMetres: 6,
  roughness: 0.55,
  graph: tex.material({
    height: scaleH,
    depth: 0.004,
    // Grey tone the vertex colour tints: dark grooves, each scale its own shade, lit crowns.
    albedo: scaleStamp.id.mul(0.22).add(scaleH.mul(0.78)).levels(0, 1, 0.5, 1),
    // Keratin crowns 0.36 (a monitor's scales shine when fresh), grooves holding dirt 0.78.
    roughness: scaleH.remap(0.78, 0.36),
  }),
  description:
    'Big reptile scales in true metres: glossy crowns, rough dark grooves, per-scale tone (vertex colour tints).',
});

/**
 * Horn, claw, tooth and spine keratin: the built-in satin `plastic` strip (roughness 0.35, neutral
 * albedo), so the vertex colour's root-to-tip banding carries the horn and the sheet spends no
 * custom row (the trim sheet's custom rows are nearly all taken).
 */
export const KERATIN: StripId = 'plastic';

const K = stripRect(KERATIN);

/** Keratin UVs for a piece: U along its own length from `root` down `axis`, V across the row. */
export function pinKeratin(mesh: Mesh, root: Vec3, axis: Vec3, length: number): Mesh {
  const uvs = new Float32Array(mesh.uvs.length);
  const l = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  for (let i = 0; i < mesh.positions.length / 3; i++) {
    const d =
      ((mesh.positions[i * 3] ?? 0) - root[0]) * axis[0] +
      ((mesh.positions[i * 3 + 1] ?? 0) - root[1]) * axis[1] +
      ((mesh.positions[i * 3 + 2] ?? 0) - root[2]) * axis[2];
    const t = Math.max(0, Math.min(1, d / l / Math.max(1e-6, length)));
    uvs[i * 2] = K.u0 + (0.2 * t * length) / K.metres;
    uvs[i * 2 + 1] = K.v0 + (0.3 + 0.4 * (i % 2)) * (K.v1 - K.v0);
  }
  return { ...mesh, uvs };
}

/** Pin every vertex of a piece at one point of the keratin strip (teeth). */
export function pinKeratinAt(mesh: Mesh, t: number): Mesh {
  const uvs = new Float32Array(mesh.uvs.length);
  for (let i = 0; i < uvs.length; i += 2) {
    uvs[i] = K.u0 + 0.5 * t;
    uvs[i + 1] = K.v0 + 0.5 * (K.v1 - K.v0);
  }
  return { ...mesh, uvs };
}
