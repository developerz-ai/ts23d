// Hair cards from a model (`hair` task, or the Blender `groom` cards once on our strand strip:
// groom-cards.ts) made to move: each card (a connected strip) gets a chain of `segments` bones
// from root to tip, its vertices skinned to the two nearest chain bones by their position along
// the card, and every chain bone a damped spring (springs.ts bakes them into the clips: ADR 013,
// no runtime physics). The root is the card end nearer the scalp surface (`scalp`, negative
// inside), so cards may come in either winding or order.

import type { Bone, Mesh, Vec3 } from '../core/index.ts';
import { Ts23dError } from '../core/index.ts';
import type { SpringBone } from './springs.ts';

export interface HairRigOptions {
  /** Bone the chains hang from (e.g. `head`). */
  readonly parent: string;
  /** Bone name prefix: `${prefix}${card}_${segment}`. Default `hair_`. */
  readonly prefix?: string;
  /** Bones per card: an integer 1..12 (as `scalpGuides` segments). Default 3. */
  readonly segments?: number;
  /** The scalp (negative inside): the card end nearer it is the root. */
  readonly scalp: (p: Vec3) => number;
  /** Spring per chain bone. Default 2.2 Hz, damping 0.35, ±25°. */
  readonly spring?: Omit<SpringBone, 'bone'>;
  /** Refuse more cards than this (each costs `segments` bones of the skeleton budget). */
  readonly maxCards?: number;
}

export interface HairRig {
  readonly bones: readonly Bone[];
  readonly springs: readonly SpringBone[];
  /** The cards with joints/weights indexing `bones` (offset them into the asset's skeleton). */
  readonly mesh: Mesh;
}

/** Connected components of a mesh by shared vertex positions; triangle lists per component. */
function cards(m: Mesh): number[][] {
  const P = m.positions;
  const weld = new Map<string, number>();
  const id = (v: number): number => {
    const k = `${P[v * 3]},${P[v * 3 + 1]},${P[v * 3 + 2]}`;
    const w = weld.get(k) ?? weld.size;
    weld.set(k, w);
    return w;
  };
  const vid = Int32Array.from({ length: P.length / 3 }, (_, v) => id(v));
  const up = Int32Array.from({ length: weld.size }, (_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while (up[r] !== r) r = up[r] ?? r;
    up[x] = r;
    return r;
  };
  const I = m.indices;
  for (let t = 0; t < I.length; t += 3) {
    const a = find(vid[I[t] ?? 0] ?? 0);
    for (const k of [1, 2]) {
      const b = find(vid[I[t + k] ?? 0] ?? 0);
      if (a !== b) up[Math.max(a, b)] = Math.min(a, b);
    }
  }
  const groups = new Map<number, number[]>();
  for (let t = 0; t < I.length; t += 3) {
    const r = find(vid[I[t] ?? 0] ?? 0);
    groups.set(r, [...(groups.get(r) ?? []), t / 3]);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map((g) => g[1]);
}

/** Most bones a card's chain may have. */
const MAX_SEGMENTS = 12;

export function hairRig(m: Mesh, o: HairRigOptions): HairRig {
  const seg = o.segments ?? 3;
  if (!Number.isInteger(seg) || seg < 1 || seg > MAX_SEGMENTS)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `hairRig: segments ${seg} is not a whole number of bones per card in 1..${MAX_SEGMENTS}`,
      fix: `give segments as an integer from 1 to ${MAX_SEGMENTS} (default 3)`,
    });
  const prefix = o.prefix ?? 'hair_';
  const spring = o.spring ?? { hz: 2.2, damping: 0.35, max: 25 };
  const groups = cards(m);
  if (groups.length > (o.maxCards ?? 64))
    throw new Ts23dError('T3D_NEURAL_OUTPUT_INVALID', {
      cause: `hair: ${groups.length} cards, cap ${o.maxCards ?? 64} (each takes ${seg} bones)`,
      fix: 'ask for fewer cards, or merge locks before rigging',
    });
  const P = m.positions;
  const at = (v: number): Vec3 => [P[v * 3] ?? 0, P[v * 3 + 1] ?? 0, P[v * 3 + 2] ?? 0];
  const bones: Bone[] = [];
  const springs: SpringBone[] = [];
  const joints = new Uint16Array((P.length / 3) * 4);
  const weights = new Float32Array((P.length / 3) * 4);
  groups.forEach((tris, c) => {
    const verts = [
      ...new Set(tris.flatMap((t) => [0, 1, 2].map((k) => m.indices[t * 3 + k] ?? 0))),
    ].sort((a, b) => a - b);
    // The card's long axis: the farthest pair from the first vertex, then from that one.
    const far = (from: Vec3): number =>
      verts.reduce(
        (best, v) =>
          Math.hypot(...sub(at(v), from)) > Math.hypot(...sub(at(best), from)) ? v : best,
        verts[0] ?? 0,
      );
    const a = far(at(verts[0] ?? 0));
    const b = far(at(a));
    const [root, tip] =
      Math.abs(o.scalp(at(a))) <= Math.abs(o.scalp(at(b))) ? [at(a), at(b)] : [at(b), at(a)];
    const axis = sub(tip, root);
    const len2 = axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2 || 1;
    const first = bones.length;
    for (let s = 0; s < seg; s++) {
      const name = `${prefix}${c}_${s}`;
      bones.push({
        name,
        parent: s === 0 ? o.parent : `${prefix}${c}_${s - 1}`,
        head: lerp(root, tip, s / seg),
        tail: lerp(root, tip, (s + 1) / seg),
      });
      springs.push({ bone: name, ...spring });
    }
    for (const v of verts) {
      const d = sub(at(v), root);
      const t =
        Math.max(0, Math.min(1, (d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2]) / len2)) * seg -
        0.5;
      const i0 = Math.max(0, Math.min(seg - 1, Math.floor(t)));
      const i1 = Math.min(seg - 1, i0 + 1);
      const w1 = i1 === i0 ? 0 : Math.max(0, Math.min(1, t - i0));
      joints.set([first + i0, first + i1, 0, 0], v * 4);
      weights.set([1 - w1, w1, 0, 0], v * 4);
    }
  });
  return { bones, springs, mesh: { ...m, joints, weights } };
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
