// Rigid body + colliders for the GLB (`toGlb(asset, { physics: true })`): KHR_physics_rigid_bodies
// motion on the LOD0 root (mass, centre of mass, principal inertia), one collider node per pivot
// as a child of that pivot's node, shapes in KHR_implicit_shapes, convex hulls and static trimeshes
// as meshes no node instances — so no viewer draws them. Engine-convention nodes (UCX_, -colonly)
// are opt-in (physics-engines.ts): they are visible meshes to anything that ignores the names.

import type { CompiledAsset, Mesh } from '../core/index.ts';
import {
  bodyKindOf,
  type Collider,
  checkPhysics,
  HULL_MAX_VERTICES,
  type MassProperties,
  massFindings,
  massProperties,
  physicsMaterialOf,
  triangleStrip,
} from '../physics/index.ts';
import type { Json } from './bin-writer.ts';
import type { GltfDoc } from './hierarchy.ts';
import { colliderPieces } from './physics-compound.ts';
import {
  type EngineConvention,
  hullMesh,
  writeConventionNode,
  writePositionsMesh,
} from './physics-engines.ts';
import { BODY, pivotGeometry } from './physics-pivots.ts';

export const RIGID_BODIES = 'KHR_physics_rigid_bodies';
export const IMPLICIT_SHAPES = 'KHR_implicit_shapes';

export interface PhysicsOptions {
  /** Extra engine-convention collider nodes (visible meshes in generic viewers). Default none. */
  readonly conventions?: readonly EngineConvention[];
  /** Convex hull vertex cap; default 64. */
  readonly maxHullVertices?: number;
}

export interface ColliderReport {
  readonly node: string;
  readonly shape: Collider['kind'];
  /** Collider volume ÷ convex hull volume (1 = tight). */
  readonly ratio: number;
  readonly strip: string;
}

export interface PhysicsReport {
  readonly body: 'static' | 'dynamic' | 'kinematic';
  readonly mass: MassProperties;
  readonly colliders: readonly ColliderReport[];
  /** QA `mass` findings (empty unless `real.mass` is declared and missed). */
  readonly findings: readonly { readonly message: string; readonly fix: string }[];
}

function dominantStrip(m: Mesh): string {
  const count = new Map<string, number>();
  for (let t = 0; t < m.indices.length / 3; t++) {
    const s = triangleStrip(m.uvs, m.indices, t);
    count.set(s, (count.get(s) ?? 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? 'plain';
}

const r6 = (v: number): number => Math.round(v * 1e6) / 1e6;
const rv = (v: readonly number[]): number[] => v.map(r6);

function shapeJson(c: Collider): Json | null {
  if (c.kind === 'box') return { type: 'box', box: { size: rv(c.size) } };
  if (c.kind === 'sphere') return { type: 'sphere', sphere: { radius: r6(c.radius) } };
  if (c.kind === 'capsule' || c.kind === 'cylinder') {
    const p = { height: r6(c.height), radiusTop: r6(c.radius), radiusBottom: r6(c.radius) };
    return { type: c.kind, [c.kind]: p };
  }
  return null;
}

function placement(c: Collider): Json {
  if (c.kind === 'sphere') return { translation: rv(c.center) };
  if (c.kind === 'box' || c.kind === 'capsule' || c.kind === 'cylinder')
    return { translation: rv(c.center), rotation: rv(c.rotation) };
  return {};
}

/** Writes colliders + body into `doc` (LOD0 tree rooted at `root`); call before sealing the bin. */
export function writePhysics(
  doc: GltfDoc,
  asset: CompiledAsset,
  root: number,
  end: number,
  o: PhysicsOptions = {},
): { used: string[]; extensions: Json; report: PhysicsReport } {
  checkPhysics(asset);
  const body = bodyKindOf(asset);
  const nodeOf = new Map<string, number>();
  for (let i = end - 1; i > root; i--) {
    const n = doc.nodes[i]?.['name'];
    if (typeof n === 'string') nodeOf.set(n, i);
  }
  const shapes: Json[] = [];
  const materials: Json[] = [];
  const matIndex = new Map<string, number>();
  const colliders: ColliderReport[] = [];
  for (const g of pivotGeometry(asset)) {
    const parent = g.pivot === BODY ? root : nodeOf.get(g.pivot);
    if (parent === undefined) continue;
    const pieces = colliderPieces(g, body === 'static', o.maxHullVertices ?? HULL_MAX_VERTICES);
    pieces.forEach(({ mesh, fit }, k) => {
      const c = fit.collider;
      const suffix = pieces.length > 1 ? `_${k}` : '';
      const strip = dominantStrip(mesh);
      if (!matIndex.has(strip)) {
        matIndex.set(strip, materials.length);
        materials.push({ ...physicsMaterialOf(strip) });
      }
      const shape = shapeJson(c);
      if (shape) shapes.push(shape);
      const geometry: Json = shape
        ? { shape: shapes.length - 1 }
        : c.kind === 'convex'
          ? {
              mesh: writePositionsMesh(doc, hullMesh(c.hull), `${g.label}_hull${suffix}`),
              convexHull: true,
            }
          : { mesh: writePositionsMesh(doc, mesh, `${g.label}_trimesh${suffix}`) };
      const name = `${g.label}_collider${suffix}`;
      doc.nodes.push({
        name,
        ...placement(c),
        extras: { ts23d: { collider: c.kind } },
        extensions: {
          [RIGID_BODIES]: { collider: { geometry, physicsMaterial: matIndex.get(strip) } },
        },
      });
      attach(doc, parent, doc.nodes.length - 1);
      for (const engine of o.conventions ?? [])
        attach(doc, parent, writeConventionNode(doc, engine, g.label, k, c, mesh));
      colliders.push({ node: name, shape: c.kind, ratio: r6(fit.ratio), strip });
    });
  }
  const mass = massProperties(asset);
  const rootNode = doc.nodes[root];
  if (rootNode && body !== 'static') {
    const motion: Json = {
      ...(body === 'kinematic' ? { isKinematic: true } : {}),
      mass: r6(mass.mass),
      centerOfMass: rv(mass.centerOfMass),
      inertiaDiagonal: rv(mass.inertiaDiagonal),
      inertiaOrientation: rv(mass.inertiaOrientation),
    };
    const ext = (rootNode['extensions'] as Json | undefined) ?? {};
    rootNode['extensions'] = { ...ext, [RIGID_BODIES]: { motion } };
  }
  const used = [RIGID_BODIES, ...(shapes.length ? [IMPLICIT_SHAPES] : [])];
  const extensions: Json = {
    [RIGID_BODIES]: { physicsMaterials: materials },
    ...(shapes.length ? { [IMPLICIT_SHAPES]: { shapes } } : {}),
  };
  const findings = massFindings(asset, mass);
  return { used, extensions, report: { body, mass, colliders, findings } };
}

function attach(doc: GltfDoc, parentId: number, id: number): void {
  const parent = doc.nodes[parentId];
  if (!parent) return;
  parent['children'] = [...((parent['children'] as number[] | undefined) ?? []), id];
}
