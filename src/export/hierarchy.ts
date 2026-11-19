// Writes one LOD's node tree into a shared glTF document: a root node, one node per (merged) part
// with its pivot as translation, light nodes under light sockets, meshes, and the part motions as
// `run` channels (a track belt's as morph targets + a `weights` channel, tread-morphs.ts). Called
// once per LOD; the bin, materials, lights and motion samplers are shared, so a single-file GLB
// stores each identical motion and light only once.

import type { CompiledAsset, Part } from '../core/index.ts';
import { motionPaths, quatFromAxisAngle, Ts23dError } from '../core/index.ts';
import type { BinWriter, Json } from './bin-writer.ts';
import { LIGHTS, lightOf } from './lights.ts';
import { morphMeshFields } from './morph-targets.ts';
import { motionChannels, treadExtras } from './motion.ts';
import { writePrimitive } from './primitive.ts';
import { type TreadMorphs, treadMorphs } from './tread-morphs.ts';
import { treadMeshFields, treadSampler, treadTargets } from './tread-write.ts';

/** The growing glTF arrays every LOD appends to. */
export interface GltfDoc {
  readonly bin: BinWriter;
  readonly nodes: Json[];
  readonly meshes: Json[];
  readonly lights: Json[];
  readonly samplers: Json[];
  readonly channels: Json[];
  /** motion + rest pose → sampler index: the same wheel spin at LOD0 and LOD1 is one sampler. */
  readonly motionSamplers: Map<string, number[]>;
  readonly lightIndex: Map<string, number>;
}

export const newDoc = (bin: BinWriter): GltfDoc => ({
  bin,
  nodes: [],
  meshes: [],
  lights: [],
  samplers: [],
  channels: [],
  motionSamplers: new Map(),
  lightIndex: new Map(),
});

export interface HierarchyOptions {
  /** Material index for a part (trim sheet by surface, or its glow layer). */
  readonly materialOf: (part: Part, i: number) => number;
  /** Extra primitive `extensions` (KHR_materials_variants mappings of painted parts). */
  readonly primitiveExtensions?: (part: Part, i: number) => Json | undefined;
  readonly withSheet: boolean;
  readonly animations: boolean;
}

function attach(doc: GltfDoc, parentId: number, id: number): void {
  const parent = doc.nodes[parentId];
  if (!parent) return;
  parent['children'] = [...((parent['children'] as number[] | undefined) ?? []), id];
}

function lightIndexOf(doc: GltfDoc, light: Json): number {
  const key = JSON.stringify(light);
  const known = doc.lightIndex.get(key);
  if (known !== undefined) return known;
  doc.lights.push(light);
  doc.lightIndex.set(key, doc.lights.length - 1);
  return doc.lights.length - 1;
}

/** A belt's run: one `weights` sampler per (phases, pitches per loop), shared by belts and LODs. */
function addTread(doc: GltfDoc, belt: TreadMorphs, id: number): void {
  const key = `tread:${belt.targets.length}:${belt.cycles}`;
  let samplers = doc.motionSamplers.get(key);
  if (samplers === undefined) {
    doc.samplers.push(treadSampler(doc.bin, belt));
    samplers = [doc.samplers.length - 1];
    doc.motionSamplers.set(key, samplers);
  }
  doc.channels.push({ target: { node: id, path: 'weights' }, sampler: samplers[0] });
}

function addMotion(doc: GltfDoc, part: Part, id: number): void {
  if (!part.motion || part.motion.kind === 'tread') return;
  const key = JSON.stringify([part.motion, part.at, part.yaw]);
  let samplers = doc.motionSamplers.get(key);
  if (samplers === undefined) {
    const written = motionChannels(doc.bin, part.motion, id, part.at, part.yaw);
    samplers = written.map((w) => {
      doc.samplers.push(w.sampler);
      return doc.samplers.length - 1;
    });
    doc.motionSamplers.set(key, samplers);
  }
  const paths = motionPaths(part.motion);
  samplers.forEach((sampler, i) => {
    doc.channels.push({ target: { node: id, path: paths[i] }, sampler });
  });
}

/** The node of `part`'s parent; a name with no node is a merge bug, never a silent root. */
function parentNode(index: ReadonlyMap<string, number>, part: Part): number {
  const id = part.parent === null ? undefined : index.get(part.parent);
  if (id === undefined)
    throw new Ts23dError('T3D_PART_UNKNOWN', {
      cause: `part '${part.name}' parents to '${part.parent}', which has no node in the GLB`,
      fix: 'internal: pivot kept a merged parent; report with the recipe',
    });
  return id;
}

/** A NaN `at` or `yaw` would be written as `null`: refuse it with the part's name. */
function finiteTransform(part: Part): void {
  if (part.at.every((v) => Number.isFinite(v)) && Number.isFinite(part.yaw)) return;
  throw new Ts23dError('T3D_RECIPE_INVALID', {
    cause: `part '${part.name}' has a non-finite transform: at [${part.at.join(', ')}], yaw ${part.yaw}`,
    fix: 'run QA first (the non-finite gate names it); look for a divide by zero in its at/yaw maths',
  });
}

/** The written tree: its root node and each part's node (what clips and skins bind to). */
export interface WrittenTree {
  readonly root: number;
  readonly index: ReadonlyMap<string, number>;
}

/** Appends `asset`'s tree under a new root named `rootName`. */
export function writeHierarchy(
  doc: GltfDoc,
  asset: CompiledAsset,
  rootName: string,
  o: HierarchyOptions,
): WrittenTree {
  doc.nodes.push({ name: rootName, children: [] as number[] });
  const root = doc.nodes.length - 1;
  const index = new Map<string, number>();
  const names = new Set(asset.parts.map((p) => p.name));
  asset.parts.forEach((part: Part, i) => {
    finiteTransform(part);
    const node: Json = { name: part.name, translation: [...part.at] };
    if (part.yaw) node['rotation'] = [...quatFromAxisAngle([0, 0, 1], part.yaw)];
    const tread = part.motion?.kind === 'tread' ? part.motion : null;
    if (part.emitter || part.socket || tread) {
      node['extras'] = {
        ts23d: {
          ...(part.emitter ? { emitter: part.emitter } : {}),
          ...(part.socket ? { socket: part.socket } : {}),
          ...(tread ? { tread: treadExtras(tread) } : {}),
        },
      };
    }
    // The belt's morph targets exist only to play the run clip: none without animations.
    const belt = o.animations && tread ? treadMorphs(asset.parts, part, asset.lod) : null;
    if (part.mesh && part.mesh.indices.length > 0) {
      // Its own set (ADR 016): TANGENT only for the set's normal map, never for the sheet's.
      const set = part.textures;
      const tangents = set ? set.normal !== undefined : o.withSheet;
      const prim = writePrimitive(doc.bin, part.mesh, o.materialOf(part, i), tangents, !!set);
      const extensions = o.primitiveExtensions?.(part, i);
      if (belt) prim['targets'] = treadTargets(doc.bin, belt);
      doc.meshes.push({
        name: part.name,
        primitives: [extensions ? { ...prim, extensions } : prim],
        ...morphMeshFields(part.mesh),
        ...(belt ? treadMeshFields(belt) : {}),
      });
      node['mesh'] = doc.meshes.length - 1;
    }
    doc.nodes.push(node);
    const id = doc.nodes.length - 1;
    index.set(part.name, id);
    attach(doc, part.parent === null ? root : parentNode(index, part), id);
    const lit = lightOf(part);
    if (lit) {
      if (names.has(`${part.name}_light`))
        throw new Ts23dError('T3D_RECIPE_INVALID', {
          cause: `light socket '${part.name}' writes a node '${part.name}_light', which is also a part's name`,
          fix: `rename the part '${part.name}_light' or the socket: '<socket>_light' is a generated name`,
        });
      doc.nodes.push({
        name: `${part.name}_light`,
        rotation: [...lit.rotation],
        extensions: { [LIGHTS]: { light: lightIndexOf(doc, lit.light) } },
      });
      attach(doc, id, doc.nodes.length - 1);
    }
    if (belt) addTread(doc, belt, id);
    else if (o.animations) addMotion(doc, part, id);
  });
  return { root, index };
}
