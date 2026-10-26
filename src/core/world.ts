// Part-space → world-space. Parts chain translation + yaw through their parents; QA, the
// rasteriser and any back end that flattens a scene read world positions from here.

import type { Part } from './asset.ts';
import type { Mesh } from './mesh.ts';
import type { Vec3 } from './vec.ts';

export interface WorldTransform {
  readonly origin: Vec3;
  readonly yaw: number;
}

const rotZ = (p: Vec3, yaw: number): Vec3 => {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
};

export function worldTransforms(parts: readonly Part[]): Map<string, WorldTransform> {
  const out = new Map<string, WorldTransform>();
  for (const p of parts) {
    const parent = (p.parent ? out.get(p.parent) : undefined) ?? {
      origin: [0, 0, 0] as Vec3,
      yaw: 0,
    };
    const at = rotZ(p.at, parent.yaw);
    out.set(p.name, {
      origin: [parent.origin[0] + at[0], parent.origin[1] + at[1], parent.origin[2] + at[2]],
      yaw: parent.yaw + p.yaw,
    });
  }
  return out;
}

export function toWorld(t: WorldTransform, p: Vec3): Vec3 {
  const r = rotZ(p, t.yaw);
  return [r[0] + t.origin[0], r[1] + t.origin[1], r[2] + t.origin[2]];
}

export const rotateZ = rotZ;

/** A part's mesh baked into world space (positions and normals), ready for QA or rasterising. */
export function worldMesh(mesh: Mesh, t: WorldTransform): Mesh {
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);
  for (let i = 0; i < positions.length; i += 3) {
    positions.set(
      toWorld(t, [mesh.positions[i] ?? 0, mesh.positions[i + 1] ?? 0, mesh.positions[i + 2] ?? 0]),
      i,
    );
    normals.set(
      rotZ([mesh.normals[i] ?? 0, mesh.normals[i + 1] ?? 0, mesh.normals[i + 2] ?? 0], t.yaw),
      i,
    );
  }
  return { ...mesh, positions, normals };
}

// QA gates, checks, renderers and measures all ask for the same world meshes: compute once per
// parts array (a CompiledAsset's parts are immutable).
const worldCache = new WeakMap<readonly Part[], Map<string, Mesh>>();

/** Every part with geometry, in world space, keyed by part name. Cached per parts array. */
export function worldMeshes(parts: readonly Part[]): Map<string, Mesh> {
  const hit = worldCache.get(parts);
  if (hit) return hit;
  const out = computeWorldMeshes(parts);
  worldCache.set(parts, out);
  return out;
}

function computeWorldMeshes(parts: readonly Part[]): Map<string, Mesh> {
  const xf = worldTransforms(parts);
  const out = new Map<string, Mesh>();
  for (const p of parts) {
    const t = xf.get(p.name);
    if (p.mesh && t && p.mesh.indices.length > 0) out.set(p.name, worldMesh(p.mesh, t));
  }
  return out;
}
