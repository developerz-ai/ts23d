// Engine naming conventions for colliders, for importers that ignore KHR_physics_rigid_bodies:
//   unreal — `UCX_<mesh>_00`: a convex hull node Unreal's importer turns into simple collision
//   godot  — `<pivot>-convcolonly` (convex) / `<pivot>-colonly` (static trimesh): Godot's scene
//            importer replaces the node with a collision shape and drops the mesh
// Both are real meshes, so a generic viewer DRAWS them; that is why they are opt-in. They carry
// `extras.ts23d.collider` so a three.js/Babylon loader can hide them. Also: positions-only meshes.

import type { Mesh } from '../core/index.ts';
import { type Collider, cappedHull, type Hull, pointsOf } from '../physics/index.ts';
import { ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER, type Json } from './bin-writer.ts';
import type { GltfDoc } from './hierarchy.ts';

export type EngineConvention = 'unreal' | 'godot';

/** A hull as an index mesh (positions only matter for collision). */
export function hullMesh(h: Hull): Mesh {
  const positions = new Float32Array(h.vertices.flatMap((v) => [v[0], v[1], v[2]]));
  const n = h.vertices.length;
  return {
    positions,
    normals: new Float32Array(n * 3),
    uvs: new Float32Array(n * 2),
    colors: new Float32Array(n * 3),
    indices: Uint32Array.from(h.faces.flat()),
  };
}

/** POSITION + indices only, no material; returns the mesh index. Not attached to any node. */
export function writePositionsMesh(doc: GltfDoc, m: Mesh, name: string): number {
  const small = m.positions.length / 3 <= 65535;
  doc.meshes.push({
    name,
    primitives: [
      {
        attributes: { POSITION: doc.bin.accessor(m.positions, 'VEC3', ARRAY_BUFFER, true) },
        indices: doc.bin.accessor(
          small ? Uint16Array.from(m.indices) : m.indices,
          'SCALAR',
          ELEMENT_ARRAY_BUFFER,
        ),
      },
    ],
  });
  return doc.meshes.length - 1;
}

/** One convention node (child of the pivot); returns its node index. */
export function writeConventionNode(
  doc: GltfDoc,
  engine: EngineConvention,
  pivot: string,
  index: number,
  c: Collider,
  source: Mesh,
): number {
  const trimesh = engine === 'godot' && c.kind === 'mesh';
  const hull = trimesh ? null : cappedHull(pointsOf(source.positions));
  const mesh = hull ? hullMesh(hull) : source;
  const name =
    engine === 'unreal'
      ? `UCX_${pivot}_${String(index).padStart(2, '0')}`
      : `${pivot}${index ? `_${index}` : ''}${trimesh ? '-colonly' : '-convcolonly'}`;
  const node: Json = {
    name,
    mesh: writePositionsMesh(doc, mesh, name),
    extras: { ts23d: { collider: trimesh ? 'mesh' : 'convex', convention: engine } },
  };
  doc.nodes.push(node);
  return doc.nodes.length - 1;
}
