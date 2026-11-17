// Joint positions from a learned rigger (UniRig and the like), mapped onto the plan's skeleton by
// topology, never by name: the rigger's bones are `bone_0 … bone_n`. In its armature (already in
// the asset frame):
//   limbs — the four leaf chains of four or more bones that end on the ground; their last four
//           bones are hip / shoulder → toe, a fifth above them is the scapula (UniRig gives a
//           wolf's fore legs five). The pair hanging from further along the trunk is the fore
//           pair, +y is left
//   head  — the front-most leaf that is not a limb, or its parent when that leaf is one of a
//           cluster of leaves (ears and jaw hanging from the skull bone)
//   trunk — the path from the root to the head bone; the plan's spine and neck joints are laid on
//           it at the arc-length fractions they have on the geometric fit
// The head keeps the geometric fit's direction and length (it traced the muzzle: the repose
// reads the head's turn from it) and the tail its traced joints, hung from the mapped croup;
// scapulae without a rig bone ride with the mapped shoulders. Names, parents, order and limits are
// the fit's. A rig without four such limbs, with left and right swapped or with a joint outside
// the mesh is refused (T3D_MODEL_SKELETON): the caller falls back to the geometric fit and says so.

import { type Bone, Ts23dError, type Vec3 } from '../core/index.ts';
import { v3 } from './creature-curve.ts';

const fail = (cause: string): never => {
  throw new Ts23dError('T3D_MODEL_SKELETON', {
    cause: `rig joints: ${cause}`,
    fix: 'the rigger did not return a four-legged skeleton for this mesh: build with the geometric fit (rig: false), or rig a cleaner mesh (the textured LOD 0 instead of the proxy)',
  });
};

/** The point at arc-length fraction `f` (0..1) of a polyline. */
function along(pts: readonly Vec3[], f: number): Vec3 {
  const seg = pts.slice(1).map((p, i) => v3.len(v3.sub(p, pts[i] ?? p)));
  let left = f * seg.reduce((a, b) => a + b, 0);
  for (let i = 0; i < seg.length; i++) {
    const l = seg[i] ?? 0;
    if (left <= l || i === seg.length - 1)
      return v3.lerp(
        pts[i] ?? [0, 0, 0],
        pts[i + 1] ?? [0, 0, 0],
        l > 0 ? Math.min(1, left / l) : 0,
      );
    left -= l;
  }
  return pts[0] ?? [0, 0, 0];
}

/** Arc-length fraction of each point of a polyline. */
function fractions(pts: readonly Vec3[]): number[] {
  const run = [0];
  for (let i = 1; i < pts.length; i++)
    run.push((run[i - 1] ?? 0) + v3.len(v3.sub(pts[i] ?? [0, 0, 0], pts[i - 1] ?? [0, 0, 0])));
  const total = run[run.length - 1] || 1;
  return run.map((r) => r / total);
}

/** The chains a rigger's joints may replace. */
export type RigChains = 'trunk' | 'fore' | 'hind';
export const RIG_CHAINS: readonly RigChains[] = ['trunk', 'fore', 'hind'];

/** Share of the rig's height a limb's last bone must end within, from the lowest point. */
const GROUND_SHARE = 0.1;

export interface RigTopology {
  /** Root → head bone's parent. */
  readonly trunk: readonly Bone[];
  readonly head: Bone;
  /** Hip / shoulder → toe, four bones each. */
  readonly limbs: {
    readonly fore_l: Bone[];
    readonly fore_r: Bone[];
    readonly hind_l: Bone[];
    readonly hind_r: Bone[];
  };
  /** The bone above a five-bone fore limb, by side. */
  readonly scapulae: { readonly l?: Bone; readonly r?: Bone };
}

/** Reads a quadruped out of a rigger's armature (asset frame), or throws T3D_MODEL_SKELETON. */
export function rigTopology(source: readonly Bone[]): RigTopology {
  const byName = new Map(source.map((b) => [b.name, b]));
  const kids = new Map<string, Bone[]>();
  for (const b of source)
    if (b.parent !== undefined) kids.set(b.parent, [...(kids.get(b.parent) ?? []), b]);
  const leaves = source.filter((b) => !kids.has(b.name));
  /** The maximal unbranched chain ending at a leaf, root-most first. */
  const chainOf = (leaf: Bone): Bone[] => {
    const out = [leaf];
    for (
      let p = byName.get(leaf.parent ?? '');
      p && (kids.get(p.name)?.length ?? 0) === 1;
      p = byName.get(p.parent ?? '')
    )
      out.unshift(p);
    return out;
  };
  const chains = leaves.map(chainOf);
  const zs = source.flatMap((b) => [b.head[2], b.tail[2]]);
  const [floor, top] = [Math.min(...zs), Math.max(...zs)];
  const end = (c: readonly Bone[]): number => c[c.length - 1]?.tail[2] ?? 0;
  const full = chains
    .filter((c) => c.length >= 4 && end(c) <= floor + (top - floor) * GROUND_SHARE)
    .sort((p, q) => end(p) - end(q))
    .slice(0, 4);
  if (full.length !== 4)
    fail(
      `${full.length} four-bone limb chain(s) reaching the ground found, a quadruped has 4 (leaf chains: ${chains.map((c) => c.length).join(', ')})`,
    );
  const inLeg = new Set(full.flat().map((b) => b.name));
  const front = leaves.filter((b) => !inLeg.has(b.name)).sort((p, q) => q.tail[0] - p.tail[0])[0];
  if (!front) return fail('no head bone: every leaf belongs to a limb');
  // A leaf among leaves (ears, jaw) hangs from the skull bone: that one is the head.
  const skull = byName.get(front.parent ?? '');
  const siblings = skull ? (kids.get(skull.name) ?? []) : [];
  const head =
    skull && siblings.length > 1 && siblings.every((b) => !kids.has(b.name)) ? skull : front;
  const trunk: Bone[] = [];
  for (let p = byName.get(head.parent ?? ''); p; p = byName.get(p.parent ?? '')) trunk.unshift(p);
  const at = (c: readonly Bone[]): number => trunk.findIndex((b) => b.name === c[0]?.parent);
  if (full.some((c) => at(c) < 0)) fail('a limb does not hang from the trunk (root → head path)');
  const ordered = [...full].sort(
    (p, q) => at(p) - at(q) || (q[0]?.head[0] ?? 0) - (p[0]?.head[0] ?? 0),
  );
  const [h1, h2, f1, f2] = ordered;
  if (!h1 || !h2 || !f1 || !f2 || at(h2) >= at(f1))
    return fail('the limbs do not form a hind pair and a fore pair along the trunk');
  const last4 = (c: Bone[]): Bone[] => c.slice(-4);
  const pair = (a: Bone[], b: Bone[]): [Bone[], Bone[]] => {
    const [l, r] = (a[0]?.head[1] ?? 0) >= (b[0]?.head[1] ?? 0) ? [a, b] : [b, a];
    if (!(end1(l) > end1(r))) fail('a left limb ends right of its partner (crossed limbs)');
    return [l, r];
  };
  const [hind_l, hind_r] = pair(h1, h2);
  const [fore_l, fore_r] = pair(f1, f2);
  if (!((fore_l[0]?.head[0] ?? 0) > (hind_l[0]?.head[0] ?? 0)))
    fail('the fore pair is behind the hind pair (the rig faces the other way)');
  const above = (c: Bone[]): Bone | undefined => (c.length > 4 ? c[c.length - 5] : undefined);
  const [l, r] = [above(fore_l), above(fore_r)];
  return {
    trunk,
    head,
    limbs: {
      fore_l: last4(fore_l),
      fore_r: last4(fore_r),
      hind_l: last4(hind_l),
      hind_r: last4(hind_r),
    },
    scapulae: { ...(l ? { l } : {}), ...(r ? { r } : {}) },
  };
}

/** Sideways place of a limb's last bone end. */
const end1 = (c: readonly Bone[]): number => c[c.length - 1]?.tail[1] ?? 0;

/**
 * The geometric fit's bones (plan names; helpers excluded) with their joints moved onto a rigger's
 * armature. `inside` is the mesh test every mapped joint must pass. `take` names the chains that
 * move (default all): without 'trunk' the spine, neck, head and the scapulae's upper ends stay the
 * fit's (a learned rigger runs the spine through the middle of the trunk, the fit under the dorsal
 * line, where it is); without 'fore' or 'hind' that pair of legs stays the fit's.
 */
export function mapJoints(
  fitted: readonly Bone[],
  source: readonly Bone[],
  inside: (p: Vec3) => boolean,
  prefix = '',
  take: readonly RigChains[] = RIG_CHAINS,
): Bone[] {
  const rig = rigTopology(source);
  const named = (stem: string): Bone[] =>
    fitted
      .filter((b) => new RegExp(`^${stem}_\\d+$`).test(b.name.slice(prefix.length)))
      .sort((p, q) => Number(p.name.split('_').pop()) - Number(q.name.split('_').pop()));
  const out = new Map<string, { head: Vec3; tail: Vec3 }>();
  for (const [stem, chain] of Object.entries(rig.limbs)) {
    if (!take.includes(stem.startsWith('fore') ? 'fore' : 'hind')) continue;
    const ours = named(stem);
    if (ours.length !== 4)
      fail(`the plan's ${stem} has ${ours.length} bones, the rig's limb has 4`);
    ours.forEach((b, i) => {
      const from = chain[i];
      if (from)
        out.set(b.name, {
          head: from.head,
          tail: i < 3 ? (chain[i + 1]?.head ?? from.tail) : from.tail,
        });
    });
  }
  const head = fitted.find((b) => b.name === `${prefix}head`);
  const [spine, neck] = [named('spine'), named('neck')];
  if (!head || spine.length === 0)
    return fail('the plan has no spine or head to map the trunk onto');
  // Spine and neck joints at the fractions they hold on the fitted trunk line (croup → atlas).
  const ours: Vec3[] = [...spine.map((b) => b.head), ...neck.map((b) => b.head), head.head];
  const line: Vec3[] = [...rig.trunk.map((b) => b.head), rig.head.head];
  const placed = fractions(ours).map((f) => along(line, f));
  const trunk = take.includes('trunk');
  if (trunk) {
    [...spine, ...neck].forEach((b, i) => {
      const [a, c] = [placed[i], placed[i + 1]];
      if (a && c) out.set(b.name, { head: a, tail: c });
    });
    // The head joint is the rigger's; its direction and length stay the traced muzzle's.
    out.set(head.name, {
      head: rig.head.head,
      tail: v3.add(rig.head.head, v3.sub(head.tail, head.head)),
    });
  }
  const croup = out.get(spine[0]?.name ?? '')?.head;
  const bones = fitted.map((b): Bone => {
    const local = b.name.slice(prefix.length);
    const got = out.get(b.name);
    if (got) return { ...b, ...got };
    const side = /^scapula_([lr])$/.exec(local)?.[1];
    if (side === 'l' || side === 'r') {
      const tail = out.get(`${prefix}fore_${side}_0`)?.head ?? b.tail;
      const top = trunk ? rig.scapulae[side]?.head : b.head;
      return {
        ...b,
        head: underSkin(top ?? v3.add(tail, v3.sub(b.head, b.tail)), tail, inside),
        tail,
      };
    }
    // The tail keeps its traced joints; its first bone starts at the mapped croup.
    return local === 'tail_0' && croup ? { ...b, head: croup } : b;
  });
  const outside = bones
    .filter((b) => !/^(scapula|tail)/.test(b.name.slice(prefix.length)) && !inside(b.head))
    .map((b) => b.name);
  if (outside.length) fail(`mapped joint(s) outside the mesh: ${outside.join(', ')}`);
  return bones;
}

/**
 * A scapula's upper end lies just under the skin of the withers. When the mapped point is outside
 * the mesh it is pulled along the bone toward the shoulder joint until it is inside, then a tenth
 * of the bone further (QA `model` wants every joint inside the mesh).
 */
function underSkin(head: Vec3, tail: Vec3, inside: (p: Vec3) => boolean): Vec3 {
  if (inside(head)) return head;
  const at = (t: number): Vec3 => v3.lerp(head, tail, t);
  const STEPS = 20;
  for (let i = 1; i < STEPS; i++)
    if (inside(at(i / STEPS))) return at(Math.min(0.9, i / STEPS + 0.1));
  return head;
}
