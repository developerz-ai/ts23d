// Test fixtures for the model tier (not exported): a "model" of a creature made from its own
// plan's flesh capsules (model-flesh.ts `planCapsules`) as closed ten-sided tubes with cone caps,
// and that mesh as an ImportedModel with a small noisy albedo. No Blender, no files.

import { type Bone, encodePng, type Mesh, merge, type Vec3 } from '../core/index.ts';
import type { ImportedModel } from '../neural/index.ts';
import type { WeightBone } from '../passes/index.ts';
import type { Bones } from './creature-bones.ts';
import { v3 } from './creature-curve.ts';
import type { CreatureSpec } from './creature-spec.ts';
import { planCapsules } from './model-flesh.ts';

const grey: Vec3 = [0.5, 0.45, 0.4];

/** A plain 40 kg quadruped (the wolf's sourced size, default build). */
export const FIXTURE_WOLF: CreatureSpec = {
  skeleton: 'quadruped',
  mass: 40,
  length: 1.15,
  height: 0.8,
  colours: {
    coat: grey,
    nose: [0.02, 0.02, 0.02],
    iris: [0.6, 0.4, 0.1],
    keratin: [0.1, 0.1, 0.1],
  },
};

const SIDES = 10;

function tube(c: WeightBone): Mesh {
  const axis = v3.sub(c.b, c.a);
  const u = v3.norm(v3.len(axis) > 1e-9 ? axis : [1, 0, 0]);
  const e1 = v3.norm(v3.cross(u, Math.abs(u[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1]));
  const e2 = v3.cross(u, e1);
  const [r1, r2] = [c.r1 ?? 0.01, c.r2 ?? c.r1 ?? 0.01];
  const pts: Vec3[] = [v3.sub(c.a, v3.mul(u, r1)), v3.add(c.b, v3.mul(u, r2))];
  for (const [at, r] of [
    [c.a, r1],
    [c.b, r2],
  ] as const)
    for (let k = 0; k < SIDES; k++) {
      const a = (2 * Math.PI * k) / SIDES;
      pts.push(v3.add(at, v3.add(v3.mul(e1, Math.cos(a) * r), v3.mul(e2, Math.sin(a) * r))));
    }
  const tris: number[] = [];
  for (let k = 0; k < SIDES; k++) {
    const [a0, a1] = [2 + k, 2 + ((k + 1) % SIDES)];
    const [b0, b1] = [a0 + SIDES, a1 + SIDES];
    tris.push(0, a1, a0, a0, a1, b1, a0, b1, b0, 1, b0, b1);
  }
  const mid = v3.lerp(c.a, c.b, 0.5);
  const n = pts.length;
  return {
    positions: Float32Array.from(pts.flat()),
    normals: Float32Array.from(pts.flatMap((p) => v3.norm(v3.sub(p, mid)))),
    uvs: Float32Array.from({ length: n * 2 }, (_, i) => (i * 0.618034) % 1),
    colors: new Float32Array(n * 3).fill(1),
    indices: Uint32Array.from(tris),
  };
}

/** The plan's flesh as one mesh; `keep` drops capsules (a missing leg). */
export function capsuleCreature(b: Bones, keep: (c: WeightBone) => boolean = () => true): Mesh {
  return merge(planCapsules(b).filter(keep).map(tube));
}

/** A 16 × 16 albedo: value noise (`flat` false) or one grey. */
export function albedoPng(flat: boolean): Uint8Array {
  const px = new Uint8Array(16 * 16 * 4);
  for (let i = 0; i < 256; i++) {
    const v = flat ? 128 : (i * 97) % 256;
    px.set([v, v, v, 255], i * 4);
  }
  return encodePng(16, 16, px);
}

/** `mesh` as an imported three-LOD model with its own texture set. */
export function fixtureModel(mesh: Mesh, flat = false): ImportedModel {
  return {
    lods: [mesh, mesh, mesh],
    textures: { name: 'body', albedo: albedoPng(flat) },
    boneNames: {},
    clips: [],
    credit: 'fixture (generated in the test)',
    warnings: [],
    sha256: '0'.repeat(64),
    scale: 1,
  };
}

/** An asset-frame mesh as the glTF-frame data a GLB holds: asset (x, y, z) = glTF (z, x, y). */
export function toGltf(mesh: Mesh): Mesh {
  const turn = (a: Float32Array): Float32Array => {
    const out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i += 3) out.set([a[i + 1] ?? 0, a[i + 2] ?? 0, a[i] ?? 0], i);
    return out;
  };
  return { ...mesh, positions: turn(mesh.positions), normals: turn(mesh.normals) };
}

/** A rigger-like armature: nameless bones, a trunk of six, a head, two ear chains, four legs. */
export function riggerBones(o: { legs?: number; swap?: boolean; wolf?: boolean } = {}): Bone[] {
  const out: Bone[] = [];
  const add = (head: Vec3, tail: Vec3, parent?: string): string => {
    const name = `bone_${out.length}`;
    out.push({ name, head, tail, ...(parent ? { parent } : {}) });
    return name;
  };
  const xs = [-0.3, -0.15, 0.05, 0.25, 0.4, 0.5, 0.58];
  let prev: string | undefined;
  const trunk: string[] = [];
  for (let i = 0; i < 6; i++) {
    prev = add([xs[i] ?? 0, 0, 0.6 + i * 0.03], [xs[i + 1] ?? 0, 0, 0.63 + i * 0.03], prev);
    trunk.push(prev);
  }
  // `wolf`: what UniRig returns for a wolf. The skull bone points up between the ears and carries
  // three leaves (ears, jaw); a four-bone tail hangs from the root; the fore legs have five bones.
  const skull = add([0.58, 0, 0.78], o.wolf ? [0.62, 0, 0.9] : [0.8, 0, 0.72], prev);
  if (o.wolf) {
    for (const y of [0.05, -0.05]) add([0.6, y, 0.86], [0.61, y * 1.4, 0.95], skull);
    add([0.66, 0, 0.74], [0.8, 0, 0.7], skull);
    let t = trunk[0];
    for (let i = 0; i < 4; i++)
      t = add([-0.32 - i * 0.02, 0, 0.6 - i * 0.1], [-0.34 - i * 0.02, 0, 0.5 - i * 0.1], t);
  } else
    for (const y of [0.05, -0.05])
      add(
        [0.6, y * 1.2, 0.86],
        [0.6, y * 1.4, 0.9],
        add([0.58, y, 0.8], [0.6, y * 1.2, 0.86], prev),
      );
  const leg = (x: number, y: number, parent: string | undefined): void => {
    let p = parent;
    if (o.wolf && x > 0) p = add([x - 0.03, y, 0.62], [x, y, 0.5], p);
    const zs = [0.5, 0.3, 0.12, 0.04, 0.01];
    for (let i = 0; i < 4; i++)
      p = add(
        [x + (i === 3 ? 0.02 : 0), y, zs[i] ?? 0],
        [x + (i === 3 ? 0.08 : 0.02), y, zs[i + 1] ?? 0],
        p,
      );
  };
  const side = o.swap ? -1 : 1;
  const all: [number, number, string | undefined][] = [
    [0.3, 0.08 * side, trunk[3]],
    [0.3, -0.08 * side, trunk[3]],
    [-0.28, 0.08, trunk[0]],
    [-0.28, -0.08, trunk[0]],
  ];
  // `swap` crosses the fore legs: the one rooted on the left ends on the right.
  for (const [x, y, parent] of all.slice(0, o.legs ?? 4)) leg(x, y, parent);
  if (o.swap) {
    const toe = out.find((b) => b.name === 'bone_14');
    if (toe) out[out.indexOf(toe)] = { ...toe, tail: [toe.tail[0], 0.2, toe.tail[2]] };
  }
  return out;
}
