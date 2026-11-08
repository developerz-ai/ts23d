// Collision geometry per exported pivot: the same grouping the GLB writer uses (merge-pivots.ts:
// groups and moving parts are pivots, static top-level geometry is `body`), but over EVERY layer
// (glass, paint, glow) and skipping parts that opt out (`collider: 'none'`) or are leaf cards
// (`surface: 'cutout'`). A non-pivot part that names a shape gets its own entry. Meshes come back
// in the pivot's own frame, ready for fitting.

import {
  type CompiledAsset,
  type Mesh,
  merge,
  type Part,
  rotateZ,
  toWorld,
  type WorldTransform,
  worldTransforms,
} from '../core/index.ts';

/** Name of the static root pivot (matches mergeToPivots). */
export const BODY = 'body';

type ColliderKind = NonNullable<Part['collider']>;

export interface PivotGeometry {
  /** Pivot part name, or BODY for static top-level geometry (attached to the asset root). */
  readonly pivot: string;
  /** Collider node prefix: the pivot, or a part that asked for its own shape. */
  readonly label: string;
  readonly mesh: Mesh;
  /** The same geometry per source part (compound colliders split along these). */
  readonly pieces: readonly Mesh[];
  /** The pivot part's own `collider` option (BODY: 'auto'). */
  readonly collider: ColliderKind;
}

const isPivot = (p: Part): boolean => p.mesh === null || p.motion !== null;

function local(mesh: Mesh, part: WorldTransform, pivot: WorldTransform): Mesh {
  const positions = new Float32Array(mesh.positions.length);
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
  }
  return { ...mesh, positions };
}

/** Collision geometry per pivot, in pivot order (BODY first), deterministic. */
export function pivotGeometry(asset: CompiledAsset): PivotGeometry[] {
  const byName = new Map(asset.parts.map((p) => [p.name, p]));
  const xf = worldTransforms(asset.parts);
  const identity: WorldTransform = { origin: [0, 0, 0], yaw: 0 };
  const pivotOf = (p: Part): string => {
    if (isPivot(p)) return p.name;
    let cur = p.parent ? byName.get(p.parent) : undefined;
    while (cur && !isPivot(cur)) cur = cur.parent ? byName.get(cur.parent) : undefined;
    return cur?.name ?? BODY;
  };
  const buckets = new Map<string, Mesh[]>([[BODY, []]]);
  for (const p of asset.parts) if (isPivot(p)) buckets.set(p.name, []);
  const own: PivotGeometry[] = [];
  for (const p of asset.parts) {
    if (!p.mesh || p.mesh.indices.length === 0) continue;
    if (p.collider === 'none' || (p.surface === 'cutout' && p.collider === undefined)) continue;
    const pivot = pivotOf(p);
    const pt = pivot === BODY ? identity : (xf.get(pivot) ?? identity);
    const mesh = local(p.mesh, xf.get(p.name) ?? identity, pt);
    // A non-pivot part naming a shape gets its own collider on its pivot.
    if (!isPivot(p) && p.collider !== undefined && p.collider !== 'auto')
      own.push({ pivot, label: p.name, mesh, pieces: [mesh], collider: p.collider });
    else buckets.get(pivot)?.push(mesh);
  }
  const out: PivotGeometry[] = [];
  for (const [pivot, meshes] of buckets) {
    if (meshes.length === 0) continue;
    const collider = byName.get(pivot)?.collider ?? 'auto';
    out.push({ pivot, label: pivot, mesh: merge(meshes), pieces: meshes, collider });
  }
  out.push(...own);
  return out;
}
