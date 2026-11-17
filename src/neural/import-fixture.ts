// Test fixture for importModel (not exported): a tiny skinned, textured, animated GLB laid out the
// way Blender exports one: an armature node with its own rotation and scale, mesh nodes beside
// the root joint, joints with rotated rest poses, inverse binds of the rest pose.

import { encodePng, type Quat, quatFromAxisAngle } from '../core/index.ts';
import type { GltfJson } from './glb-read.ts';
import { localMatrix, type M4, mul } from './glb-scene.ts';
import { GlbBin, packGlb } from './glb-write.ts';

/** General 4×4 inverse (Gauss–Jordan), column-major in and out. */
function invert(m: M4): M4 {
  const a = Array.from({ length: 4 }, (_, r) =>
    Array.from({ length: 8 }, (_, c) => (c < 4 ? (m[c * 4 + r] ?? 0) : c - 4 === r ? 1 : 0)),
  );
  for (let c = 0; c < 4; c++) {
    let p = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(a[r]?.[c] ?? 0) > Math.abs(a[p]?.[c] ?? 0)) p = r;
    const [rowC, rowP] = [a[c] ?? [], a[p] ?? []];
    a[c] = rowP;
    a[p] = rowC;
    const d = rowP[c] ?? 1;
    for (let k = 0; k < 8; k++) rowP[k] = (rowP[k] ?? 0) / d;
    for (let r = 0; r < 4; r++) {
      const row = a[r] ?? [];
      const f = row[c] ?? 0;
      if (r !== c) for (let k = 0; k < 8; k++) row[k] = (row[k] ?? 0) - f * (rowP[k] ?? 0);
    }
  }
  const out = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out[c * 4 + r] = a[r]?.[c + 4] ?? 0;
  return out;
}

export interface RigFixture {
  /** Names of the three mesh nodes. Default lod0 / lod1 / lod2; [] = one mesh node 'body'. */
  readonly lodNames?: readonly string[];
  /** MIME type and bytes of the baseColor image. Default a 2×2 PNG. */
  readonly albedo?: { readonly mime: string; readonly bytes: Uint8Array };
  /** Add JOINTS_1 / WEIGHTS_1 so vertex 0 has five influences. */
  readonly fiveInfluences?: boolean;
}

export const RIG_SPINE_REST: Quat = quatFromAxisAngle([1, 0, 0], 0.5);
/** The spine key at 1.0 s of 'Walk Cycle' (absolute, glTF local). */
export const RIG_SPINE_KEY: Quat = quatFromAxisAngle([0.3, 1, 0.2], 0.9);

/**
 * nodes: 0 root · 1 Armature (turned, ×0.5) · 2 Hip.Root · 3 SpineUpper · 4 Arm.L · 5 Arm.R ·
 * 6 Tail · 7 'Head End' (unweighted leaf) · 8.. mesh nodes. A 4-row strip of 8 vertices bound in
 * its rest pose. Animations: 'Walk Cycle' (keys at 0.5, 1, 1.5 s: spine rotation, hip translation,
 * a rest-valued arm scale, the armature node, the unweighted leaf) and 'run' (STEP tail rotation).
 */
export function riggedGlb(o: RigFixture = {}): Uint8Array {
  const q = (axis: [number, number, number], rad: number): number[] => [
    ...quatFromAxisAngle(axis, rad),
  ];
  const lodNames = o.lodNames ?? ['lod0', 'lod1', 'lod2'];
  const meshNames = lodNames.length ? lodNames : ['body'];
  const nodes: GltfJson[] = [
    { name: 'root', children: [1] },
    {
      name: 'Armature',
      rotation: q([0, 1, 0], 0.4),
      scale: [0.5, 0.5, 0.5],
      translation: [0.2, 0, -0.1],
      children: [2, ...meshNames.map((_, i) => 8 + i)],
    },
    { name: 'Hip.Root', translation: [0, 1, 0], rotation: q([0, 0, 1], 1.2), children: [3, 6] },
    {
      name: 'SpineUpper',
      translation: [1.1, 0.1, 0],
      rotation: [...RIG_SPINE_REST],
      children: [4, 5, 7],
    },
    { name: 'Arm.L', translation: [0.4, 0.6, 0.2], rotation: q([0, 1, 0], -0.7) },
    { name: 'Arm.R', translation: [0.4, -0.6, 0.2], rotation: q([0, 1, 0], 0.7) },
    { name: 'Tail', translation: [-0.6, 0, 0.1], rotation: q([1, 1, 0], 0.3) },
    { name: 'Head End', translation: [0.9, 0, 0] },
  ];
  const parent = [-1, 0, 1, 2, 3, 3, 2, 3];
  const world: M4[] = [];
  nodes.forEach((n, i) => {
    const above = world[parent[i] ?? -1];
    world.push(above ? mul(above, localMatrix(n)) : localMatrix(n));
  });
  const joints = [2, 3, 4, 5, 6, 7];
  const bin = new GlbBin();
  // GlbBin.accessor knows float and uint32 vectors only: matrices and u16 joints go in by hand.
  const raw = (data: Float32Array | Uint16Array, type: string, count: number): number => {
    bin.accessors.push({
      bufferView: bin.view(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)),
      componentType: data instanceof Uint16Array ? 5123 : 5126,
      count,
      type,
    });
    return bin.accessors.length - 1;
  };
  const png = (rgb: [number, number, number]): number =>
    bin.view(
      encodePng(
        2,
        2,
        Uint8Array.from({ length: 16 }, (_, i) => [...rgb, 255][i % 4] ?? 0),
      ),
    );
  const position = new Float32Array(24);
  const uv = new Float32Array(16);
  for (let v = 0; v < 8; v++) {
    position.set([v % 2 ? 0.3 : -0.3, Math.floor(v / 2) * 0.5, 0.1 * v], v * 3);
    uv.set([v % 2, Math.floor(v / 2) / 3], v * 2);
  }
  const normal = Float32Array.from({ length: 24 }, (_, i) => (i % 3 === 2 ? 1 : 0));
  // Skin-joint indices and weights per vertex (4 each): hip 0, spine 1, arm_l 2, arm_r 3, tail 4.
  const jointsOf = [
    0, 1, 2, 3, 0, 4, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 2, 0, 0, 1, 3, 0, 0, 2, 1, 0, 0, 3, 1, 0, 0,
  ];
  const weightsOf = [
    0.4, 0.2, 0.1, 0.1, 0.5, 0.5, 0, 0, 0.5, 0.5, 0, 0, 1, 0, 0, 0, 0.6, 0.4, 0, 0, 0.7, 0.3, 0, 0,
    0.9, 0.1, 0, 0, 1, 0, 0, 0,
  ];
  const attributes: GltfJson = {
    POSITION: bin.accessor(position, 'VEC3', true),
    NORMAL: bin.accessor(normal, 'VEC3'),
    TEXCOORD_0: bin.accessor(uv, 'VEC2'),
    JOINTS_0: raw(Uint16Array.from(jointsOf), 'VEC4', 8),
    WEIGHTS_0: bin.accessor(
      Float32Array.from(
        o.fiveInfluences ? weightsOf : [0.5, 0.25, 0.125, 0.125, ...weightsOf.slice(4)],
      ),
      'VEC4',
    ),
  };
  if (o.fiveInfluences) {
    attributes['JOINTS_1'] = raw(
      Uint16Array.from({ length: 32 }, (_, i) => (i ? 0 : 4)),
      'VEC4',
      8,
    );
    attributes['WEIGHTS_1'] = bin.accessor(
      Float32Array.from({ length: 32 }, (_, i) => (i ? 0 : 0.2)),
      'VEC4',
    );
  }
  const tris = [0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6, 5, 7, 6];
  const meshes = meshNames.map((name, k) => ({
    name,
    primitives: [
      {
        attributes,
        indices: bin.accessor(Uint32Array.from(tris.slice(0, tris.length - 6 * k)), 'SCALAR'),
        material: 0,
      },
    ],
  }));
  meshNames.forEach((name, i) => {
    nodes.push({ name, mesh: i, skin: 0, translation: [5, 5, 5] });
  });
  const ibm = new Float32Array(joints.length * 16);
  joints.forEach((j, i) => {
    ibm.set(invert(world[j] as M4), i * 16);
  });
  const albedo = o.albedo ?? {
    mime: 'image/png',
    bytes: encodePng(2, 2, new Uint8Array(16).fill(200)),
  };
  const images = [
    { bufferView: bin.view(albedo.bytes), mimeType: albedo.mime },
    { bufferView: png([128, 128, 255]), mimeType: 'image/png' },
    { bufferView: png([255, 180, 0]), mimeType: 'image/png' },
  ];
  const times = bin.accessor(new Float32Array([0.5, 1, 1.5]), 'SCALAR', true);
  const vec = (type: string, keys: number[][]): number =>
    bin.accessor(Float32Array.from(keys.flat()), type);
  const turn = q([0, 1, 0], 0.4);
  const samplers = [
    {
      input: times,
      output: vec('VEC4', [[...RIG_SPINE_REST], [...RIG_SPINE_KEY], [...RIG_SPINE_REST]]),
    },
    {
      input: times,
      output: vec('VEC3', [
        [0, 1, 0],
        [0.2, 1.1, -0.3],
        [0, 1, 0],
      ]),
    },
    {
      input: times,
      output: vec('VEC3', [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
      ]),
    },
    { input: times, output: vec('VEC4', [turn, turn, turn]) },
    { input: times, output: vec('VEC4', [[0, 0, 0, 1], q([0, 0, 1], 0.5), [0, 0, 0, 1]]) },
  ];
  const channel = (sampler: number, node: number, path: string): GltfJson => ({
    sampler,
    target: { node, path },
  });
  const tail = nodes[6]?.['rotation'] as number[];
  const json: GltfJson = {
    asset: { version: '2.0', generator: 'ts23d rig fixture' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    meshes,
    materials: [
      {
        name: 'Wolf Body',
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicRoughnessTexture: { index: 2 },
        },
        normalTexture: { index: 1 },
        occlusionTexture: { index: 2 },
      },
    ],
    textures: [{ source: 0 }, { source: 1 }, { source: 2 }],
    images,
    skins: [{ joints, inverseBindMatrices: raw(ibm, 'MAT4', joints.length) }],
    animations: [
      {
        name: 'Walk Cycle',
        samplers,
        channels: [
          channel(0, 3, 'rotation'),
          channel(1, 2, 'translation'),
          channel(2, 4, 'scale'),
          channel(3, 1, 'rotation'),
          channel(4, 7, 'rotation'),
        ],
      },
      {
        name: 'run',
        samplers: [
          {
            input: times,
            interpolation: 'STEP',
            output: vec('VEC4', [tail, q([1, 0, 0], 0.8), tail]),
          },
        ],
        channels: [channel(0, 6, 'rotation')],
      },
    ],
    buffers: [{ byteLength: 0 }],
  };
  const body = bin.bytes();
  json['buffers'] = [{ byteLength: body.byteLength }];
  json['bufferViews'] = bin.views;
  json['accessors'] = bin.accessors;
  return packGlb(json, body);
}
