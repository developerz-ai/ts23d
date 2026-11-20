// Merge for passes that only read geometry (ray-cast occluders, a shared weathering space): the
// skin and morph targets are left out, so a skinned body next to a rigid saddle joins instead of
// tripping core `merge`'s T3D_SKIN_INVALID. That refusal is right where a skin must survive the
// merge (export binds the rigid pieces first); here the union is never exported.

import { type Mesh, mappedOf, merge } from '../core/index.ts';

/** `m` without joints, weights and morphs (the arrays are shared, not copied). */
export const geometryOf = (m: Mesh): Mesh => ({
  positions: m.positions,
  normals: m.normals,
  uvs: m.uvs,
  colors: m.colors,
  indices: m.indices,
  ...mappedOf(m),
});

/** One mesh of every input's positions, normals, UVs, colours and triangles; no skin, no morphs. */
export const mergeGeometry = (meshes: readonly Mesh[]): Mesh => merge(meshes.map(geometryOf));
