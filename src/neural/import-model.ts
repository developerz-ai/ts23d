// importModel: a GLB from an image-to-3D model, a Blender step program or a rigging service as IR
// values, nothing dropped at the door: every LOD mesh with the file's own UVs (glTF convention,
// 0..1, V down), its PNG maps as one TextureSet (ADR 016), its skin as an Armature with 4
// influences per vertex (ADR 013) and its animations as Clips. Same licence gate, axes, fit and
// placement as importGlb, measured on LOD 0 and applied to every LOD, bone and clip key. No
// cleanMesh (it would break UVs and weights): only bit-identical vertices are welded.
// LODs: nodes named lod0 / lod1 / lod2 (or `<anything>_lod0`…; `lodNodes` overrides) each give one
// LOD from the meshes at or below them; with none (or only `lod0`), the whole default scene is the
// single LOD 0.

import {
  type Armature,
  boundsOf,
  type Clip,
  type Mesh,
  merge,
  type TextureSet,
  Ts23dError,
} from '../core/index.ts';
import { readGlb } from './glb-read.ts';
import { type SceneGraph, type ScenePrimitive, sceneGraph, scenePrimitives } from './glb-scene.ts';
import { importBytes } from './import-cache.ts';
import { smoothNormals } from './import-clean.ts';
import { importClips } from './import-clips.ts';
import { axesFrame, fitFrame, frameArray } from './import-frame.ts';
import type { ImportOptions, ImportSource } from './import-glb.ts';
import { checkLicence } from './import-licence.ts';
import { importRig } from './import-rig.ts';
import { jointCentroids, type SkinnedPrimitive, skinPrimitive } from './import-skin.ts';
import { importTextures, type TextureOptions } from './import-textures.ts';
import { weldExact } from './import-weld.ts';
import { sha256Hex } from './sha256.ts';

/** Bytes in hand (a `ctx.neural` output, a fetched file): hashed here, no cache entry needed. */
export interface InlineModel {
  readonly bytes: Uint8Array;
  readonly license: string;
  readonly author: string;
  /** Where it came from. Default 'inline bytes'. */
  readonly url?: string;
  readonly allowNonCommercial?: boolean;
}

export interface ImportModelOptions extends Omit<ImportOptions, 'clean'>, TextureOptions {
  /** Names of the three LOD nodes, highest detail first. Default ['lod0', 'lod1', 'lod2']. */
  readonly lodNodes?: readonly [string, string, string];
  /** Close cycles that arrive one frame short of their period (import-clips-loop.ts). Default true. */
  readonly closeLoops?: boolean;
}

export interface ImportedModel {
  /** 1 or 3 meshes, highest detail first: Z up, metres, the file's UVs, joints/weights if skinned. */
  readonly lods: readonly Mesh[];
  /** The model's own maps; absent when its material has no baseColor texture. */
  readonly textures?: TextureSet;
  /** Present when the model is skinned; `Mesh.joints` index its bones. */
  readonly armature?: Armature;
  /** The file's joint node name → bone name (snake_case). Empty when unskinned. */
  readonly boneNames: Readonly<Record<string, string>>;
  /** Clips on the armature's bones, relative to its rest pose. */
  readonly clips: readonly Clip[];
  readonly credit: string;
  readonly warnings: readonly string[];
  readonly sha256: string;
  /** File units → metres actually applied (scale × fit). */
  readonly scale: number;
}

const memo = new Map<string, ImportedModel>();
const hashes = new WeakMap<Uint8Array, string>();

function resolve(source: ImportSource | InlineModel): ImportSource {
  if ('sha256' in source) return source;
  let sha256 = hashes.get(source.bytes);
  if (sha256 === undefined) {
    sha256 = sha256Hex(source.bytes);
    hashes.set(source.bytes, sha256);
  }
  return {
    path: 'inline bytes',
    sha256,
    license: source.license,
    author: source.author,
    url: source.url ?? 'inline bytes',
    ...(source.allowNonCommercial ? { allowNonCommercial: true } : {}),
  };
}

const matches = (node: string, want: string): boolean => {
  const [n, w] = [node.toLowerCase(), want.toLowerCase()];
  return n === w || n.endsWith(`_${w}`);
};

/** The primitives of each LOD: three lists by LOD node, or one list of everything. */
function lodGroups(
  prims: readonly ScenePrimitive[],
  graph: SceneGraph,
  o: ImportModelOptions,
  warnings: string[],
): ScenePrimitive[][] {
  const want = o.lodNodes ?? ['lod0', 'lod1', 'lod2'];
  const found = want.map((w) => graph.order.find((i) => matches(graph.name(i), w)));
  const hits = found.filter((f) => f !== undefined).length;
  if (hits === 0 && !o.lodNodes) return [[...prims]];
  // A program without a `lods` step exports its one mesh as `lod0`: a single-LOD model.
  if (hits === 1 && found[0] !== undefined && !o.lodNodes) return [[...prims]];
  if (hits < want.length)
    throw new Ts23dError('T3D_IMPORT_UNSUPPORTED', {
      cause: `LOD nodes ${want.map((w) => `'${w}'`).join(', ')}: found ${hits} of ${want.length}; the scene's mesh nodes are ${[...new Set(prims.map((p) => `'${graph.name(p.node)}'`))].join(', ') || '(none)'}`,
      fix: 'name three nodes lod0, lod1, lod2 (the Blender `lods` step does), or pass `lodNodes` with the names the file uses',
    });
  const groups: ScenePrimitive[][] = want.map(() => []);
  let outside = 0;
  for (const p of prims) {
    let k = -1;
    for (let i = p.node; i >= 0 && k < 0; i = graph.parent.get(i) ?? -1) k = found.indexOf(i);
    if (k < 0) outside++;
    else groups[k]?.push(p);
  }
  if (outside) warnings.push(`${outside} mesh primitives outside the LOD nodes ignored`);
  return groups;
}

export function importModel(
  source: ImportSource | InlineModel,
  o: ImportModelOptions = {},
): ImportedModel {
  const src = resolve(source);
  const licence = checkLicence(src, src.allowNonCommercial === true);
  const bytes = 'sha256' in source ? importBytes(source) : source.bytes;
  const key = JSON.stringify([src.sha256, o, licence.credit]);
  const hit = memo.get(key);
  if (hit) return hit;
  const axes = axesFrame(o);
  const doc = readGlb(bytes);
  const graph = sceneGraph(doc);
  const warnings: string[] = licence.warning ? [licence.warning] : [];
  const groups = lodGroups(scenePrimitives(doc, { skins: true }), graph, o, warnings);
  groups.forEach((g, k) => {
    if (!g.some((p) => p.mesh.indices.length))
      throw new Ts23dError('T3D_IMPORT_EMPTY', {
        cause: `'${src.path}' has no triangles ${groups.length > 1 ? `under its LOD ${k} node` : 'in its default scene'}`,
        fix: 'export the mesh (not only an armature or empties) with triangles, and include it in the scene',
      });
    const skinned = g.filter((p) => p.skin !== undefined).length;
    if (skinned && skinned < g.length)
      throw new Ts23dError('T3D_IMPORT_UNSUPPORTED', {
        cause: `LOD ${k} mixes ${skinned} skinned and ${g.length - skinned} unskinned meshes (${g.map((p) => `'${p.name}'`).join(', ')})`,
        fix: 'bind every mesh to the armature (the Blender `bind` step), or join them into one mesh before exporting',
      });
  });
  const all = groups.flat();
  const tex = importTextures(
    doc,
    all.map((p) => p.material),
    licence.credit,
    o,
  );
  const skins = new Map<ScenePrimitive, SkinnedPrimitive>();
  for (const p of all) if (p.skin !== undefined) skins.set(p, skinPrimitive(doc, p, graph));
  // The file's world frame → axes and unit scale; LOD 0's bounds then fix the fit and placement.
  const filed = groups.map((g) =>
    merge(
      g.map((p) => {
        const m = skins.get(p)?.mesh ?? p.mesh;
        const posed = { ...m, positions: frameArray(axes, m.positions) };
        const colors = tex.set ? new Float32Array(m.colors.length).fill(1) : m.colors;
        if (tex.set && m.colors.some((c) => c !== 1))
          warnings.push(`'${p.name}': vertex colour / baseColorFactor dropped (textured: white)`);
        return {
          ...(p.flatNormals
            ? smoothNormals(posed)
            : { ...posed, normals: frameArray(axes, m.normals, true) }),
          colors,
        };
      }),
    ),
  );
  const flesh = jointCentroids([...skins.values()]);
  const frame = fitFrame(axes, boundsOf(filed[0] as Mesh), o);
  const k = frame.scale / axes.scale;
  const rig = skins.size
    ? importRig(
        doc,
        graph,
        [...new Set(all.flatMap((p) => (p.skin === undefined ? [] : [p.skin])))],
        new Set(flesh.keys()),
        flesh,
        frame,
      )
    : undefined;
  const lods = groups.map((g, i) => {
    const m = filed[i] as Mesh;
    const placed: Mesh = {
      ...m,
      positions: m.positions.map((v, c) => v * k + (frame.offset[c % 3] ?? 0)),
    };
    if (!rig) return weldExact(placed);
    const joints = new Uint16Array((placed.positions.length / 3) * 4);
    const weights = new Float32Array(joints.length);
    let at = 0;
    for (const p of g) {
      const s = skins.get(p);
      if (!s) continue;
      // An unused slot repeats the first joint with weight 0, so every index names a kept bone.
      joints.set(
        s.nodes.map(
          (n, j) =>
            rig.boneOfNode.get((s.weights[j] ?? 0) > 0 ? n : (s.nodes[j - (j % 4)] ?? n)) ?? 0,
        ),
        at,
      );
      weights.set(s.weights, at);
      at += s.nodes.length;
    }
    return weldExact({ ...placed, joints, weights });
  });
  for (const s of new Set([...skins.values()].flatMap((x) => x.warnings))) warnings.push(s);
  const anim = rig ? importClips(doc, graph, rig, frame, o) : { clips: [], warnings: [] };
  const out: ImportedModel = {
    lods,
    ...(tex.set ? { textures: tex.set } : {}),
    ...(rig ? { armature: rig.armature } : {}),
    boneNames: rig?.boneNames ?? {},
    clips: anim.clips,
    credit: licence.credit,
    warnings: [...warnings, ...tex.warnings, ...(rig?.warnings ?? []), ...anim.warnings],
    sha256: src.sha256,
    scale: frame.scale,
  };
  memo.set(key, out);
  return out;
}
