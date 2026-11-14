// Writes one LOD's node tree into a shared glTF document: a root node, one node per (merged) part
// with its pivot as translation, light nodes under light sockets, meshes, and the part motions as
// `run` channels. Called once per LOD; the bin, materials, lights and motion samplers are shared,
// so a single-file GLB stores each identical motion and light only once.

import type { CompiledAsset, Part } from '../core/index.ts';
import { quatFromAxisAngle, Ts23dError } from '../core/index.ts';
import type { BinWriter, Json } from './bin-writer.ts';
import { LIGHTS, lightOf } from './lights.ts';
import { motionChannel, treadExtras } from './motion.ts';
import { writePrimitive } from './primitive.ts';

/** The growing glTF arrays every LOD appends to. */
export interface GltfDoc {
  readonly bin: BinWriter;
  readonly nodes: Json[];
  readonly meshes: Json[];
  readonly lights: Json[];
  readonly samplers: Json[];
  readonly channels: Json[];
  /** motion + rest pose → sampler index: the same wheel spin at LOD0 and LOD1 is one sampler. */
  readonly motionSamplers: Map<string, number>;
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

function addMotion(doc: GltfDoc, part: Part, id: number): void {
  if (!part.motion || part.motion.kind === 'tread') return;
  const key = JSON.stringify([part.motion, part.at, part.yaw]);
  let sampler = doc.motionSamplers.get(key);
  let channel: Json;
  if (sampler === undefined) {
    const written = motionChannel(doc.bin, part.motion, id, part.at, part.yaw);
    doc.samplers.push(written.sampler);
    sampler = doc.samplers.length - 1;
    doc.motionSamplers.set(key, sampler);
    channel = written.channel;
  } else {
    channel = {
      target: { node: id, path: part.motion.kind === 'slide' ? 'translation' : 'rotation' },
    };
  }
  doc.channels.push({ ...channel, sampler });
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

/** Appends `asset`'s tree under a new root named `rootName`; returns the root node index. */
export function writeHierarchy(
  doc: GltfDoc,
  asset: CompiledAsset,
  rootName: string,
  o: HierarchyOptions,
): number {
  doc.nodes.push({ name: rootName, children: [] as number[] });
  const root = doc.nodes.length - 1;
  const index = new Map<string, number>();
  asset.parts.forEach((part: Part, i) => {
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
    if (part.mesh && part.mesh.indices.length > 0) {
      const prim = writePrimitive(doc.bin, part.mesh, o.materialOf(part, i), o.withSheet);
      const extensions = o.primitiveExtensions?.(part, i);
      doc.meshes.push({
        name: part.name,
        primitives: [extensions ? { ...prim, extensions } : prim],
      });
      node['mesh'] = doc.meshes.length - 1;
    }
    doc.nodes.push(node);
    const id = doc.nodes.length - 1;
    index.set(part.name, id);
    attach(doc, part.parent === null ? root : parentNode(index, part), id);
    const lit = lightOf(part);
    if (lit) {
      doc.nodes.push({
        name: `${part.name}_light`,
        rotation: [...lit.rotation],
        extensions: { [LIGHTS]: { light: lightIndexOf(doc, lit.light) } },
      });
      attach(doc, id, doc.nodes.length - 1);
    }
    if (o.animations) addMotion(doc, part, id);
  });
  return root;
}
