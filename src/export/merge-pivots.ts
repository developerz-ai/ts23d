// Batching for engines: every part that is NOT a pivot is merged into its nearest pivot ancestor,
// so draw calls = pivots with geometry, not parts. A pivot is anything the engine may move: a
// group (`ctx.group`, a named handle like `turret`, `gun`, `door_l`) or a part with `motion`.
// Static top-level geometry merges into one `body` part. Names the engine binds to survive.
// Non-opaque surfaces split into `<pivot>_<surface>` children (one draw call per surface).

import {
  type CompiledAsset,
  type Mesh,
  merge,
  type Part,
  rotateZ,
  type Surface,
  toWorld,
  type WorldTransform,
  worldTransforms,
} from '../core/index.ts';

const isPivot = (p: Part): boolean => p.mesh === null || p.motion !== null;
const SURFACES: readonly Surface[] = ['cutout', 'glass', 'translucent'];

/** Re-express a part's mesh in its pivot's local space. */
function intoPivot(mesh: Mesh, part: WorldTransform, pivot: WorldTransform): Mesh {
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);
  for (let i = 0; i < positions.length; i += 3) {
    const w = toWorld(part, [
      mesh.positions[i] ?? 0,
      mesh.positions[i + 1] ?? 0,
      mesh.positions[i + 2] ?? 0,
    ]);
    positions.set(
      rotateZ([w[0] - pivot.origin[0], w[1] - pivot.origin[1], w[2] - pivot.origin[2]], -pivot.yaw),
      i,
    );
    normals.set(
      rotateZ(
        rotateZ(
          [mesh.normals[i] ?? 0, mesh.normals[i + 1] ?? 0, mesh.normals[i + 2] ?? 0],
          part.yaw,
        ),
        -pivot.yaw,
      ),
      i,
    );
  }
  return { ...mesh, positions, normals };
}

export function mergeToPivots(asset: CompiledAsset): CompiledAsset {
  const byName = new Map(asset.parts.map((p) => [p.name, p]));
  const xf = worldTransforms(asset.parts);
  const ROOT = 'body';
  const identity: WorldTransform = { origin: [0, 0, 0], yaw: 0 };
  const pivotOf = (p: Part): string => {
    let cur = p.parent ? byName.get(p.parent) : undefined;
    while (cur && !isPivot(cur)) cur = cur.parent ? byName.get(cur.parent) : undefined;
    return cur?.name ?? ROOT;
  };
  // Buckets keyed by pivot + surface: opaque merges into the pivot's own mesh; each other
  // surface in use becomes one child `<pivot>_<surface>` so materials never mix in a primitive.
  const extra = new Map<string, Mesh[]>();
  const bucket = (pivot: string, surface: Surface | undefined, mesh: Mesh): void => {
    const k = `${pivot}|${surface ?? 'opaque'}`;
    extra.set(k, [...(extra.get(k) ?? []), mesh]);
  };
  for (const p of asset.parts) {
    if (!p.mesh) continue;
    if (isPivot(p)) {
      bucket(p.name, p.surface, p.mesh);
      continue;
    }
    const pivot = pivotOf(p);
    const t = xf.get(p.name) ?? identity;
    const pt = pivot === ROOT ? identity : (xf.get(pivot) ?? identity);
    bucket(pivot, p.surface, intoPivot(p.mesh, t, pt));
  }
  const parts: Part[] = [];
  const layers = (pivot: string, parent: string | null): void => {
    for (const surface of SURFACES) {
      const meshes = extra.get(`${pivot}|${surface}`);
      if (!meshes) continue;
      parts.push({
        name: `${pivot}_${surface}`,
        mesh: merge(meshes),
        at: [0, 0, 0],
        parent,
        yaw: 0,
        motion: null,
        surface,
      });
    }
  };
  const body = extra.get(`${ROOT}|opaque`);
  if (body)
    parts.push({
      name: ROOT,
      mesh: merge(body),
      at: [0, 0, 0],
      parent: null,
      yaw: 0,
      motion: null,
    });
  layers(ROOT, null);
  for (const p of asset.parts) {
    if (!isPivot(p)) continue;
    const own = extra.get(`${p.name}|opaque`);
    const { surface: _drop, ...rest } = p;
    parts.push({ ...rest, mesh: own ? merge(own) : null });
    layers(p.name, p.name);
  }
  return { ...asset, parts };
}
