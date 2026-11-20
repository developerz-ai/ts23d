// The joints of a GLB's skins as a ts23d Armature (ADR 013): one bone per joint node, parents
// first, heads at the joints' REST world positions moved into the asset frame. glTF joints are
// points with an orientation; ts23d bones are head → tail segments with no rest rotation, so:
//   tail = the child's head when the joint has exactly one child joint (and it is apart);
//   a leaf points through the centre of the vertices it moves, twice as far (its flesh);
//   else along the parent's direction (head − parent head), as long as the mean distance to the
//        children, or half the parent bone for a leaf no vertex follows;
//   a root with nothing to follow points at the mean of its children, else straight up, 0.1 m.
// Names become snake_case (the map is returned). A joint no vertex is weighted to is dropped
// unless a weighted joint hangs below it.

import type { Armature, Bone, Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import { at, type GlbDoc, indices } from './glb-read.ts';
import type { SceneGraph } from './glb-scene.ts';
import { framePoint, type ImportFrame } from './import-frame.ts';
import { snakeName } from './import-textures.ts';

export interface ImportedRig {
  readonly armature: Armature;
  /** The file's joint node name → the bone's name. */
  readonly boneNames: Readonly<Record<string, string>>;
  /** Joint node index → index into `armature.bones`. */
  readonly boneOfNode: ReadonlyMap<number, number>;
  /** Joint nodes left out (unweighted, with no weighted joint below). */
  readonly dropped: ReadonlySet<number>;
  readonly warnings: readonly string[];
}

const MIN_LENGTH = 1e-3;
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: Vec3): number => dmath.hypot(a[0], a[1], a[2]);

function tailOf(
  head: Vec3,
  parent: Vec3 | undefined,
  children: readonly Vec3[],
  flesh: Vec3 | undefined,
): Vec3 {
  const along = (dir: Vec3, length: number): Vec3 => {
    const l = len(dir);
    const k = Math.max(length, MIN_LENGTH) / l;
    return [head[0] + dir[0] * k, head[1] + dir[1] * k, head[2] + dir[2] * k];
  };
  const only = children[0];
  if (children.length === 1 && only && len(sub(only, head)) >= MIN_LENGTH) return only;
  const toFlesh = flesh ? sub(flesh, head) : undefined;
  if (!children.length && toFlesh && len(toFlesh) >= MIN_LENGTH)
    return along(toFlesh, 2 * len(toFlesh));
  const reach = children.length
    ? children.reduce((t, c) => t + len(sub(c, head)), 0) / children.length
    : undefined;
  const fromParent = parent ? sub(head, parent) : undefined;
  if (fromParent && len(fromParent) >= MIN_LENGTH)
    return along(fromParent, reach ?? len(fromParent) / 2);
  const n = Math.max(children.length, 1);
  const mean = children.reduce<Vec3>(
    (t, c) => [t[0] + c[0] / n, t[1] + c[1] / n, t[2] + c[2] / n],
    [0, 0, 0],
  );
  const toMean = sub(mean, head);
  if (children.length && len(toMean) >= MIN_LENGTH) return along(toMean, len(toMean));
  return along([0, 0, 1], reach ?? 0.1);
}

/**
 * The armature of `skins` (indices into the file's skins). `used` = joint nodes some vertex is
 * weighted to, `flesh` = the centre of the vertices each joint node moves (file world frame);
 * `frame` = the model's import transform.
 */
export function importRig(
  doc: GlbDoc,
  graph: SceneGraph,
  skins: readonly number[],
  used: ReadonlySet<number>,
  flesh: ReadonlyMap<number, Vec3>,
  frame: ImportFrame,
): ImportedRig {
  const joints = new Set(skins.flatMap((s) => indices(at(doc, 'skins', s), 'joints')));
  const order = graph.order.filter((i) => joints.has(i));
  const parentOf = (i: number): number => {
    for (let p = graph.parent.get(i) ?? -1; p >= 0; p = graph.parent.get(p) ?? -1)
      if (joints.has(p)) return p;
    return -1;
  };
  const parent = new Map(order.map((i) => [i, parentOf(i)]));
  const head = new Map(
    order.map((i): [number, Vec3] => {
      const w = graph.world.get(i);
      return [i, framePoint(frame, [w?.[12] ?? 0, w?.[13] ?? 0, w?.[14] ?? 0])];
    }),
  );
  const children = new Map<number, number[]>(order.map((i) => [i, []]));
  for (const i of order) children.get(parent.get(i) ?? -1)?.push(i);
  // Children come after parents in `order`, so one reverse pass finds every joint to keep.
  const keep = new Set<number>();
  for (const i of [...order].reverse())
    if (used.has(i) || (children.get(i) ?? []).some((c) => keep.has(c))) keep.add(i);
  const dropped = new Set(order.filter((i) => !keep.has(i)));
  const names = new Map<number, string>();
  const taken = new Set<string>();
  const boneNames: Record<string, string> = {};
  for (const i of order) {
    if (!keep.has(i)) continue;
    const base = snakeName(graph.name(i), 'bone');
    let name = base;
    for (let k = 2; taken.has(name); k++) name = `${base}_${k}`;
    taken.add(name);
    names.set(i, name);
    boneNames[graph.name(i)] = name;
  }
  const centre = new Map([...flesh].map(([i, c]): [number, Vec3] => [i, framePoint(frame, c)]));
  const at0: Vec3 = [0, 0, 0];
  const bones: Bone[] = [];
  const boneOfNode = new Map<number, number>();
  for (const i of order) {
    const name = names.get(i);
    if (name === undefined) continue;
    const p = parent.get(i) ?? -1;
    const h = head.get(i) ?? at0;
    const kids = (children.get(i) ?? []).map((c) => head.get(c) ?? at0);
    const parentName = names.get(p);
    boneOfNode.set(i, bones.length);
    bones.push({
      name,
      ...(parentName !== undefined ? { parent: parentName } : {}),
      head: h,
      tail: tailOf(h, p >= 0 ? head.get(p) : undefined, kids, centre.get(i)),
    });
  }
  const warnings = dropped.size
    ? [
        `${dropped.size} unweighted joints dropped (${[...dropped]
          .slice(0, 6)
          .map((i) => graph.name(i))
          .join(', ')}${dropped.size > 6 ? ', …' : ''})`,
      ]
    : [];
  return { armature: { bones }, boneNames, boneOfNode, dropped, warnings };
}
