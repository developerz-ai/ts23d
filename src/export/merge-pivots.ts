// Batching for engines: every part that is NOT a pivot is merged into its nearest pivot ancestor,
// so draw calls = pivots with geometry, not parts. A pivot is anything the engine may move: a
// group (`ctx.group`, a named handle like `turret`, `gun`, `door_l`) or a part with `motion`.
// Static top-level geometry merges into one `body` part. Names the engine binds to survive.
// Non-opaque surfaces split into `<pivot>_<surface>` children (one draw call per surface), and
// glowing parts (GlbOptions.glow) into `<pivot>_glow_<i>` children with their emissive material,
// and painted parts (`paint: slot`) into `<pivot>_paint_<slot>` children with the slot's material,
// and finished parts (`finish: name`) into `<pivot>_finish_<name>` children with the finish's.
// Parts with their own texture set (ADR 016) never mix with trim-sheet geometry: a pivot whose own
// geometry is all ONE set carries that set itself; otherwise each set in use splits into a
// `<pivot>_tex_<set>` child (`<pivot>_cutout_tex_<set>` for its cutout parts).
// A pivot whose static parent merged away is re-parented to its nearest surviving pivot ancestor
// (or the root), with `at` / `yaw` re-expressed so its world transform is exactly what QA measured.
// Unskinned meshes merging into a skinned one, or into another material layer of its pivot, bind
// rigidly to their nearest bone.

import {
  type CompiledAsset,
  type Mesh,
  merge,
  type Part,
  ROOT_PART,
  rotateZ,
  type Surface,
  type TextureSet,
  textureSetsOf,
  toWorld,
  type Vec3,
  type WorldTransform,
  worldTransforms,
} from '../core/index.ts';
import { bindLoose } from './skin.ts';

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

/** One bucket of a pivot's geometry: its key and what the merged part carries for it. */
interface Layer {
  readonly key: string;
  readonly props: Pick<Part, 'surface' | 'paint' | 'finish' | 'textures'>;
  readonly glow?: number;
}
const texLayer = (set: TextureSet, cutout: boolean): string =>
  `${cutout ? 'cutout_' : ''}tex_${set.name}`;

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
  // A recipe's rigid prop merging into a skinned body binds to its nearest bone (skin.ts).
  // The body's layers are separate meshes: a rigid prop rides its bone in whichever it lands.
  const skinned = new Set<string>();
  const join = (ms: readonly Mesh[], pivot: string): Mesh =>
    merge(bindLoose(ms, asset.skeleton, skinned.has(pivot)));
  const glowRes = glow.map((globs) => globs.map(globRe));
  const glowOf = (name: string): number => glowRes.findIndex((rs) => rs.some((r) => r.test(name)));
  const byName = new Map(asset.parts.map((p) => [p.name, p]));
  const xf = worldTransforms(asset.parts);
  const ROOT = ROOT_PART;
  const identity: WorldTransform = { origin: [0, 0, 0], yaw: 0 };
  const pivotOf = (p: Part): string => {
    let cur = p.parent ? byName.get(p.parent) : undefined;
    while (cur && !isPivot(cur)) cur = cur.parent ? byName.get(cur.parent) : undefined;
    return cur?.name ?? ROOT;
  };
  // Buckets keyed by pivot + layer: opaque merges into the pivot's own mesh; each other layer in
  // use becomes one child `<pivot>_<layer>` so materials never mix in a primitive.
  const extra = new Map<string, Mesh[]>();
  // A texture set wins over everything (core allows it no paint or finish, and it has no emissive
  // map to glow with); glow wins over paint (a lit lens keeps its emissive material).
  const layerOf = (p: Part, g: number): string =>
    p.textures
      ? texLayer(p.textures, p.surface === 'cutout')
      : g >= 0
        ? `glow_${g}`
        : (p.surface ??
          (p.paint !== undefined
            ? `paint_${p.paint}`
            : p.finish !== undefined
              ? `finish_${p.finish}`
              : 'opaque'));
  const bucket = (pivot: string, layer: string, mesh: Mesh): void => {
    const k = `${pivot}|${layer}`;
    if (mesh.joints) skinned.add(pivot);
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
  const used = <T>(of: (p: Part) => T | undefined): T[] =>
    [...new Set(asset.parts.flatMap((p) => of(p) ?? []))].sort();
  const sets = [...textureSetsOf(asset.parts)].sort((a, b) => (a.name < b.name ? -1 : 1));
  const tex = (set: TextureSet, cutout: boolean): Layer => ({
    key: texLayer(set, cutout),
    props: cutout ? { textures: set, surface: 'cutout' } : { textures: set },
  });
  // Every layer a pivot may split into, in the order its children are written.
  const all: readonly Layer[] = [
    ...SURFACES.map((surface) => ({ key: surface, props: { surface } })),
    ...glow.map((_, g) => ({ key: `glow_${g}`, props: {}, glow: g })),
    ...used((p) => p.paint).map((paint) => ({ key: `paint_${paint}`, props: { paint } })),
    ...used((p) => p.finish).map((finish) => ({ key: `finish_${finish}`, props: { finish } })),
    ...sets.flatMap((set) => [tex(set, false), tex(set, true)]),
  ];
  // The pivot's own mesh: its trim-sheet opaque geometry; with none, its ONE opaque texture set
  // (a fully textured body stays the node `body`, so skins, morph tracks and names hold).
  const ownOf = (pivot: string): Layer | null => {
    if (extra.has(`${pivot}|opaque`)) return { key: 'opaque', props: {} };
    const own = sets.filter((s) => extra.has(`${pivot}|${texLayer(s, false)}`));
    return own.length === 1 && own[0] ? tex(own[0], false) : null;
  };
  const meshOf = (pivot: string, layer: Layer | null): Mesh | null => {
    const meshes = layer ? extra.get(`${pivot}|${layer.key}`) : undefined;
    return meshes ? join(meshes, pivot) : null;
  };
  const parts: Part[] = [];
  const layers = (pivot: string, parent: string | null, own: Layer | null): void => {
    for (const layer of all) {
      const mesh = layer.key === own?.key ? null : meshOf(pivot, layer);
      if (!mesh) continue;
      const part: Part = {
        name: `${pivot}_${layer.key}`,
        mesh,
        at: [0, 0, 0],
        parent,
        yaw: 0,
        motion: null,
        ...layer.props,
      };
      if (layer.glow !== undefined) glowLayer.set(part, layer.glow);
      parts.push(part);
    }
  };
  const body = ownOf(ROOT);
  if (body)
    parts.push({
      name: ROOT,
      mesh: meshOf(ROOT, body),
      at: [0, 0, 0],
      parent: null,
      yaw: 0,
      motion: null,
      ...body.props,
    });
  layers(ROOT, null, body);
  // A pivot under a static (merged) parent keeps its world transform under the nearest pivot.
  const reparented = (p: Part): Pick<Part, 'parent' | 'at' | 'yaw'> => {
    const parent = p.parent ? byName.get(p.parent) : undefined;
    // Only these three: spreading `p` would hand its paint / finish / textures to the merged mesh.
    if (!parent || isPivot(parent)) return { parent: p.parent, at: p.at, yaw: p.yaw };
    const anchor = pivotOf(p);
    const w = xf.get(p.name) ?? identity;
    const a = anchor === ROOT ? identity : (xf.get(anchor) ?? identity);
    const d: Vec3 = [
      w.origin[0] - a.origin[0],
      w.origin[1] - a.origin[1],
      w.origin[2] - a.origin[2],
    ];
    return { parent: anchor === ROOT ? null : anchor, at: rotateZ(d, -a.yaw), yaw: w.yaw - a.yaw };
  };
  for (const p of asset.parts) {
    if (!isPivot(p)) continue;
    const own = ownOf(p.name);
    const { surface: _drop, paint: _slot, finish: _finish, textures: _set, ...rest } = p;
    parts.push({ ...rest, ...reparented(p), mesh: meshOf(p.name, own), ...own?.props });
    layers(p.name, p.name, own);
  }
  return { ...asset, parts };
}
