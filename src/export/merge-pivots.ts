// Batching for engines: every part that is NOT a pivot is merged into its nearest pivot ancestor,
// so draw calls = pivots with geometry, not parts. A pivot is anything the engine may move: a
// group (`ctx.group`, a named handle like `turret`, `gun`, `door_l`) or a part with `motion`.
// Static top-level geometry merges into one `body` part. Names the engine binds to survive.
// Non-opaque surfaces split into `<pivot>_<surface>` children (one draw call per surface), and
// glowing parts (GlbOptions.glow) into `<pivot>_glow_<i>` children with their emissive material,
// and painted parts (`paint: slot`) into `<pivot>_paint_<slot>` children with the slot's material,
// and finished parts (`finish: name`) into `<pivot>_finish_<name>` children with the finish's.

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

/** Merged layer parts that glow → index of the glow rule (read by the GLB writer). */
export const glowLayer = new WeakMap<Part, number>();

/** `*`/`?` glob → anchored RegExp (export cannot import /qa: same tier). */
export const globRe = (pattern: string): RegExp =>
  new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replaceAll('*', '.*')
      .replaceAll('?', '.')}$`,
  );
const SURFACES: readonly Surface[] = ['cutout', 'glass', 'translucent', 'ice', 'liquid', 'jelly'];

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

export function mergeToPivots(
  asset: CompiledAsset,
  glow: readonly (readonly string[])[] = [],
): CompiledAsset {
  const glowRes = glow.map((globs) => globs.map(globRe));
  const glowOf = (name: string): number => glowRes.findIndex((rs) => rs.some((r) => r.test(name)));
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
  // Glow wins over paint (a lit lens keeps its emissive material); paint is opaque-only (core).
  const layerOf = (p: Part, g: number): string =>
    g >= 0
      ? `glow_${g}`
      : (p.surface ??
        (p.paint !== undefined
          ? `paint_${p.paint}`
          : p.finish !== undefined
            ? `finish_${p.finish}`
            : 'opaque'));
  const bucket = (pivot: string, layer: string, mesh: Mesh): void => {
    const k = `${pivot}|${layer}`;
    extra.set(k, [...(extra.get(k) ?? []), mesh]);
  };
  for (const p of asset.parts) {
    if (!p.mesh) continue;
    const layer = layerOf(p, glowOf(p.name));
    if (isPivot(p)) {
      bucket(p.name, layer, p.mesh);
      continue;
    }
    const pivot = pivotOf(p);
    const t = xf.get(p.name) ?? identity;
    const pt = pivot === ROOT ? identity : (xf.get(pivot) ?? identity);
    bucket(pivot, layer, intoPivot(p.mesh, t, pt));
  }
  const slots = [...new Set(asset.parts.flatMap((p) => (p.paint === undefined ? [] : [p.paint])))];
  slots.sort();
  const finishes = [
    ...new Set(asset.parts.flatMap((p) => (p.finish === undefined ? [] : [p.finish]))),
  ].sort();
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
    glow.forEach((_, g) => {
      const meshes = extra.get(`${pivot}|glow_${g}`);
      if (!meshes) return;
      const part: Part = {
        name: `${pivot}_glow_${g}`,
        mesh: merge(meshes),
        at: [0, 0, 0],
        parent,
        yaw: 0,
        motion: null,
      };
      glowLayer.set(part, g);
      parts.push(part);
    });
    for (const slot of slots) {
      const meshes = extra.get(`${pivot}|paint_${slot}`);
      if (!meshes) continue;
      parts.push({
        name: `${pivot}_paint_${slot}`,
        mesh: merge(meshes),
        at: [0, 0, 0],
        parent,
        yaw: 0,
        motion: null,
        paint: slot,
      });
    }
    for (const finish of finishes) {
      const meshes = extra.get(`${pivot}|finish_${finish}`);
      if (!meshes) continue;
      parts.push({
        name: `${pivot}_finish_${finish}`,
        mesh: merge(meshes),
        at: [0, 0, 0],
        parent,
        yaw: 0,
        motion: null,
        finish,
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
    const { surface: _drop, paint: _slot, finish: _finish, ...rest } = p;
    parts.push({ ...rest, mesh: own ? merge(own) : null });
    layers(p.name, p.name);
  }
  return { ...asset, parts };
}
