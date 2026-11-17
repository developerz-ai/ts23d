// One skinned primitive of a GLB as ts23d can carry it (ADR 013): its JOINTS_n / WEIGHTS_n
// reduced to the 4 heaviest influences per vertex (renormalised to sum 1, named by joint NODE so
// any armature order can index them later), and its vertices baked to the REST pose in the file's
// world frame: v = Σ w · (jointWorld · inverseBind) · v, what a viewer shows before any clip plays.
// That removes the mesh's bind space, armature transforms and inverse bind matrices from the
// problem: afterwards a joint only needs its head position (import-rig.ts).

import { type Mesh, Ts23dError } from '../core/index.ts';
import { at, type GlbDoc, indices, readAccessor } from './glb-read.ts';
import { type M4, mul, type SceneGraph, type ScenePrimitive } from './glb-scene.ts';

const KEEP = 4;

export interface SkinnedPrimitive {
  /** Rest pose, file world frame; `joints` / `weights` are added once the armature exists. */
  readonly mesh: Mesh;
  /** 4 joint node indices per vertex (the heaviest first; unused slots repeat the first). */
  readonly nodes: Int32Array;
  /** 4 weights per vertex, summing to 1. */
  readonly weights: Float32Array;
  readonly warnings: readonly string[];
}

const corrupt = (cause: string): never => {
  throw new Ts23dError('T3D_IMPORT_GLB', {
    cause,
    fix: 'export the file again; its skin is corrupt',
  });
};

/** JOINTS_0..n / WEIGHTS_0..n interleaved per vertex: `per` = 4 × sets. */
function rawInfluences(
  doc: GlbDoc,
  p: ScenePrimitive,
  n: number,
): { per: number; joints: Float32Array; weights: Float32Array } {
  const sets: [Float32Array, Float32Array][] = [];
  for (let s = 0; ; s++) {
    const [j, w] = [p.attributes[`JOINTS_${s}`], p.attributes[`WEIGHTS_${s}`]];
    if (typeof j !== 'number' || typeof w !== 'number') break;
    const [jd, wd] = [readAccessor(doc, j), readAccessor(doc, w)];
    if (jd.width !== 4 || wd.width !== 4 || jd.count < n || wd.count < n)
      corrupt(`'${p.name}': JOINTS_${s} / WEIGHTS_${s} are not VEC4 × ${n} vertices`);
    sets.push([jd.data, wd.data]);
  }
  if (!sets.length)
    throw new Ts23dError('T3D_IMPORT_UNSUPPORTED', {
      cause: `'${p.name}' sits on a skinned node but has no JOINTS_0 / WEIGHTS_0`,
      fix: 'bind every mesh of the model to the armature (the Blender `bind` step does), or export it without a skin',
    });
  const per = sets.length * 4;
  const joints = new Float32Array(n * per);
  const weights = new Float32Array(n * per);
  sets.forEach(([j, w], s) => {
    for (let v = 0; v < n; v++) {
      joints.set(j.subarray(v * 4, v * 4 + 4), v * per + s * 4);
      weights.set(w.subarray(v * 4, v * 4 + 4), v * per + s * 4);
    }
  });
  return { per, joints, weights };
}

/** jointWorld · inverseBind per skin joint (file world frame, rest pose). */
function restMatrices(doc: GlbDoc, skin: number, graph: SceneGraph, nodes: number[]): M4[] {
  const ibmAt = at(doc, 'skins', skin)['inverseBindMatrices'];
  const ibm = typeof ibmAt === 'number' ? readAccessor(doc, ibmAt) : null;
  if (ibm && (ibm.width !== 16 || ibm.count < nodes.length))
    corrupt(`skins[${skin}] has ${ibm.count} inverse bind matrices for ${nodes.length} joints`);
  return nodes.map((node, j) => {
    const world = graph.world.get(node);
    if (!world) return corrupt(`skins[${skin}] joint node ${node} is outside the default scene`);
    return ibm ? mul(world, Float64Array.from(ibm.data.subarray(j * 16, j * 16 + 16))) : world;
  });
}

/** Largest element difference between the rest matrices: 0 when rest pose = bind pose. */
function bindSpread(ms: readonly M4[], used: ReadonlySet<number>): number {
  let worst = 0;
  let first: M4 | undefined;
  ms.forEach((m, j) => {
    if (!used.has(j)) return;
    first ??= m;
    for (let k = 0; k < 16; k++) worst = Math.max(worst, Math.abs((m[k] ?? 0) - (first[k] ?? 0)));
  });
  return worst;
}

export function skinPrimitive(doc: GlbDoc, p: ScenePrimitive, graph: SceneGraph): SkinnedPrimitive {
  const n = p.mesh.positions.length / 3;
  const skin = p.skin ?? 0;
  const jointNodes = indices(at(doc, 'skins', skin), 'joints');
  if (!jointNodes.length) corrupt(`skins[${skin}] has no joints`);
  const raw = rawInfluences(doc, p, n);
  const rest = restMatrices(doc, skin, graph, jointNodes);
  const nodes = new Int32Array(n * KEEP);
  const weights = new Float32Array(n * KEEP);
  const positions = new Float32Array(n * 3);
  const normals = new Float32Array(n * 3);
  const usedJoints = new Set<number>();
  let reduced = 0;
  let unbound = 0;
  for (let v = 0; v < n; v++) {
    const sum = new Map<number, number>();
    for (let s = 0; s < raw.per; s++) {
      const w = raw.weights[v * raw.per + s] ?? 0;
      if (!(w > 0)) continue;
      const j = raw.joints[v * raw.per + s] ?? 0;
      if (!Number.isInteger(j) || j < 0 || j >= jointNodes.length)
        corrupt(`'${p.name}' vertex ${v} is weighted to joint ${j} of ${jointNodes.length}`);
      sum.set(j, (sum.get(j) ?? 0) + w);
    }
    // Heaviest first; ties by joint index, so the pick never depends on attribute order.
    const top = [...sum].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    if (top.length > KEEP) reduced++;
    if (!top.length) {
      unbound++;
      top.push([0, 1]);
    }
    const kept = top.slice(0, KEEP);
    const total = kept.reduce((t, [, w]) => t + w, 0);
    const [x, y, z] = [0, 1, 2].map((k) => p.mesh.positions[v * 3 + k] ?? 0) as [
      number,
      number,
      number,
    ];
    const [a, b, c] = [0, 1, 2].map((k) => p.mesh.normals[v * 3 + k] ?? 0) as [
      number,
      number,
      number,
    ];
    const pos = [0, 0, 0];
    const nrm = [0, 0, 0];
    for (let s = 0; s < KEEP; s++) {
      const [j, w] = kept[s] ?? [kept[0]?.[0] ?? 0, 0];
      nodes[v * KEEP + s] = jointNodes[j] ?? 0;
      weights[v * KEEP + s] = w / total;
      const m = rest[j];
      if (!m || w === 0) continue;
      usedJoints.add(j);
      for (let r = 0; r < 3; r++) {
        const row: [number, number, number] = [m[r] ?? 0, m[4 + r] ?? 0, m[8 + r] ?? 0];
        pos[r] =
          (pos[r] ?? 0) + (w / total) * (row[0] * x + row[1] * y + row[2] * z + (m[12 + r] ?? 0));
        nrm[r] = (nrm[r] ?? 0) + (w / total) * (row[0] * a + row[1] * b + row[2] * c);
      }
    }
    const l = Math.hypot(nrm[0] ?? 0, nrm[1] ?? 0, nrm[2] ?? 0) || 1;
    positions.set(pos, v * 3);
    normals.set(
      nrm.map((k) => k / l),
      v * 3,
    );
  }
  const warnings: string[] = [];
  if (reduced)
    warnings.push(
      `'${p.name}': ${reduced} vertices had more than ${KEEP} bone influences; kept the ${KEEP} heaviest and renormalised`,
    );
  if (unbound)
    warnings.push(
      `'${p.name}': ${unbound} vertices had no weights; bound to '${graph.name(jointNodes[0] ?? 0)}'`,
    );
  if (bindSpread(rest, usedJoints) > 1e-4)
    warnings.push(
      `'${p.name}': the rest pose is not the bind pose; the mesh is imported in its rest pose, so vertices shared by several bones deform approximately`,
    );
  return { mesh: { ...p.mesh, positions, normals }, nodes, weights, warnings };
}

/**
 * Weight-weighted centre of the vertices each joint node moves (file world frame, rest pose):
 * where a leaf bone's flesh is, which is the only hint of where its tail belongs.
 */
export function jointCentroids(
  prims: readonly SkinnedPrimitive[],
): Map<number, [number, number, number]> {
  const acc = new Map<number, [number, number, number, number]>();
  for (const p of prims)
    for (let i = 0; i < p.nodes.length; i++) {
      const w = p.weights[i] ?? 0;
      if (w === 0) continue;
      const a = acc.get(p.nodes[i] ?? 0) ?? [0, 0, 0, 0];
      const v = Math.floor(i / KEEP) * 3;
      for (let k = 0; k < 3; k++) a[k] = (a[k] ?? 0) + w * (p.mesh.positions[v + k] ?? 0);
      a[3] += w;
      acc.set(p.nodes[i] ?? 0, a);
    }
  return new Map([...acc].map(([n, [x, y, z, w]]) => [n, [x / w, y / w, z / w]]));
}
