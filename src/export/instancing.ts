// Instanced scene export: one mesh drawn many times (a city's windows, street lamps, a forest's
// trees) as a glTF node carrying EXT_mesh_gpu_instancing — per-instance TRANSLATION, ROTATION
// (about Z, the asset's up) and SCALE accessors — so engines upload the geometry once and draw it
// in one call. The unique geometry (the merged static body) is a plain node beside them. Z-up is
// rotated to glTF's Y-up at the root, like every other ts23d GLB. Also the scene manifest the
// scene-budget gate reads: unique meshes, instance counts and triangles.

import { type Mesh, quatFromAxisAngle, Ts23dError, type Vec3 } from '../core/index.ts';
import { ARRAY_BUFFER, BinWriter, type Json } from './bin-writer.ts';
import { Z_UP_TO_Y_UP } from './clips.ts';
import { packGlb } from './container.ts';
import { writePrimitive } from './primitive.ts';
import { GENERATOR } from './version.ts';

export const GPU_INSTANCING = 'EXT_mesh_gpu_instancing';

export interface InstanceTransform {
  readonly at: Vec3;
  /** Radians about Z. */
  readonly yaw?: number;
  readonly scale?: Vec3;
}

export interface InstanceSet {
  readonly name: string;
  readonly mesh: Mesh;
  readonly transforms: readonly InstanceTransform[];
}

export interface InstancedScene {
  readonly name: string;
  /** Geometry drawn once (the merged static body); optional. */
  readonly base?: Mesh;
  readonly sets: readonly InstanceSet[];
  /** Credit lines (ODbL attribution for OSM-derived scenes) carried into `asset.copyright`. */
  readonly copyright?: string;
}

export interface SceneManifest {
  readonly name: string;
  readonly uniqueMeshes: number;
  readonly instances: number;
  readonly sets: readonly {
    readonly name: string;
    readonly count: number;
    readonly triangles: number;
  }[];
  readonly baseTriangles: number;
  readonly copyright?: string;
}

const tris = (m: Mesh): number => m.indices.length / 3;

export function sceneManifest(s: InstancedScene): SceneManifest {
  return {
    name: s.name,
    uniqueMeshes: s.sets.length + (s.base ? 1 : 0),
    instances: s.sets.reduce((n, x) => n + x.transforms.length, 0),
    sets: s.sets.map((x) => ({
      name: x.name,
      count: x.transforms.length,
      triangles: tris(x.mesh),
    })),
    baseTriangles: s.base ? tris(s.base) : 0,
    ...(s.copyright ? { copyright: s.copyright } : {}),
  };
}

function checkScene(s: InstancedScene): void {
  const names = new Set<string>();
  for (const set of s.sets) {
    const fail = (cause: string, fix: string): never => {
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `instance set '${set.name}': ${cause}`,
        fix,
      });
    };
    if (names.has(set.name)) fail('name used twice', 'give every instance set its own name');
    names.add(set.name);
    if (set.transforms.length === 0) fail('has no instances', 'drop the set or give it transforms');
    if (tris(set.mesh) === 0) fail('mesh has no triangles', 'instance a real mesh');
    for (const t of set.transforms)
      if (![...t.at, t.yaw ?? 0, ...(t.scale ?? [1, 1, 1])].every(Number.isFinite))
        fail(`transform ${JSON.stringify(t)} is not finite`, 'give finite metres and radians');
  }
}

/** The scene as one GLB: base node + one EXT_mesh_gpu_instancing node per set. */
export function toInstancedGlb(s: InstancedScene): Uint8Array {
  checkScene(s);
  const bin = new BinWriter();
  const meshes: Json[] = [];
  const nodes: Json[] = [{ name: s.name, rotation: Z_UP_TO_Y_UP, children: [] as number[] }];
  const children = nodes[0]?.['children'] as number[];
  const add = (node: Json): void => {
    children.push(nodes.length);
    nodes.push(node);
  };
  if (s.base) {
    meshes.push({ name: `${s.name}_base`, primitives: [writePrimitive(bin, s.base, 0, false)] });
    add({ name: `${s.name}_base`, mesh: meshes.length - 1 });
  }
  for (const set of s.sets) {
    meshes.push({ name: set.name, primitives: [writePrimitive(bin, set.mesh, 0, false)] });
    const n = set.transforms.length;
    const T = new Float32Array(n * 3);
    const R = new Float32Array(n * 4);
    const S = new Float32Array(n * 3);
    set.transforms.forEach((t, i) => {
      T.set(t.at, i * 3);
      R.set(quatFromAxisAngle([0, 0, 1], t.yaw ?? 0), i * 4);
      S.set(t.scale ?? [1, 1, 1], i * 3);
    });
    add({
      name: set.name,
      mesh: meshes.length - 1,
      extensions: {
        [GPU_INSTANCING]: {
          attributes: {
            TRANSLATION: bin.accessor(T, 'VEC3', ARRAY_BUFFER),
            ROTATION: bin.accessor(R, 'VEC4', ARRAY_BUFFER),
            SCALE: bin.accessor(S, 'VEC3', ARRAY_BUFFER),
          },
        },
      },
      extras: { instances: n },
    });
  }
  const body = bin.bytes();
  const gltf: Json = {
    asset: {
      version: '2.0',
      generator: GENERATOR,
      ...(s.copyright ? { copyright: s.copyright } : {}),
    },
    extras: {
      units: 'metres',
      up: 'Z (rotated to glTF Y-up at the root)',
      manifest: sceneManifest(s),
    },
    extensionsUsed: [GPU_INSTANCING],
    extensionsRequired: [GPU_INSTANCING],
    scene: 0,
    scenes: [{ name: s.name, nodes: [0] }],
    nodes,
    meshes,
    materials: [
      { name: 'trim', pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.8 } },
    ],
    buffers: [{ byteLength: body.byteLength }],
    bufferViews: bin.views,
    accessors: bin.accessors,
  };
  return packGlb(gltf, body);
}
