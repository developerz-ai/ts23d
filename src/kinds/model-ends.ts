// The ends of a model's body, wherever its pose put them (fitSkeleton's second half):
//   head — the nose is the surface point farthest from and most in front of the neck's base,
//          among the points ahead of the shoulders, above the free legs and off the leg bones; the head's axis runs from the centre of the
//          surface within ¾ head length of the nose to the nose; the atlas sits one plan head
//          bone back along it, centred in the neck's section
//   neck — base carried with the shoulders; joints between base and atlas at the plan's
//          spacing, each centred in the neck (medial axis)
//   tail — from the fitted croup to the farthest surface point behind it that is not a leg,
//          joints at the plan's spacing, centred in the tail
// The plan's lengths are not forced: a tucked tail gives short tail bones (and a bushy one up to
// twice the plan's; beyond that the find is the rump, and the plan's length is kept).

import type { Bone, Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import { capsuleDistance } from '../passes/index.ts';
import type { TriBvh } from '../primitives/index.ts';
import type { Bones } from './creature-bones.ts';
import { v3 } from './creature-curve.ts';
import type { LegTrace } from './model-legs.ts';
import { medial } from './model-sections.ts';

export type Pts = Map<string, { head: Vec3; tail: Vec3 }>;

/** Bones named `<stem>_<i>` in index order (the chain root → tip). */
export function chainOf(plan: readonly Bone[], prefix: string, stem: string): Bone[] {
  const re = new RegExp(`^${stem}_(\\d+)$`);
  return plan
    .filter((x) => re.test(x.name.slice(prefix.length)))
    .sort((p, q) => Number(p.name.split('_').pop()) - Number(q.name.split('_').pop()));
}

/** Writes a fitted polyline (root … tip) back onto a chain's bones. */
export function writeChain(pos: Pts, chain: readonly Bone[], pts: readonly Vec3[]): void {
  chain.forEach((x, i) => {
    const [head, tail] = [pts[i], pts[i + 1]];
    if (head && tail) pos.set(x.name, { head, tail });
  });
}

/** The nose is the far point that is also in FRONT of the neck's base: distance + this × how far
 *  ahead (a bear's shoulder is farther from its neck than its nose is, but not ahead of it). */
const NOSE_AHEAD = 1;

/** Least inscribed radius ÷ plan height a tail holds three quarters of the way down. */
const THICK = 0.015;

/** A found tail may be this many times the plan's before it is taken for the rump. */
const TAIL_STRETCH = 2;

export interface EndsInput {
  readonly pos: Pts;
  readonly plan: readonly Bone[];
  readonly prefix: string;
  readonly b: Bones;
  readonly bvh: TriBvh;
  readonly cloud: Float32Array;
  readonly traces: readonly LegTrace[];
  /** How far the shoulders moved along X from the plan. */
  readonly dxFore: number;
  /** Trunk section at x: its middle y and top z, or null where the mesh has none. */
  readonly section: (x: number) => { y: number; top: number } | null;
}

/** Joints from `a` to `z` at the plan polyline's spacing, each centred across the a → z line. */
function strung(bvh: TriBvh, planPts: readonly Vec3[], a: Vec3, z: Vec3, reach: number): Vec3[] {
  const seg = planPts.slice(1).map((p, i) => v3.len(v3.sub(p, planPts[i] ?? p)));
  const total = seg.reduce((s, l) => s + l, 0) || 1;
  const axis = v3.sub(z, a);
  let run = 0;
  return planPts.map((_, i) => {
    if (i === 0) return a;
    run += seg[i - 1] ?? 0;
    if (i === planPts.length - 1) return z;
    return medial(bvh, v3.lerp(a, z, run / total), axis, reach).at;
  });
}

/** Fits neck, head and tail in `pos`; returns the head's yaw off +X (degrees) and the tail's
 *  thickness (the smallest inscribed radius at its joints, metres; 0 without a tail). */
export function fitEnds(e: EndsInput): { headYaw: number; tailRadius: number } {
  const { pos, plan, prefix, b, bvh, cloud } = e;
  const H = b.height;
  const inside = (p: Vec3): boolean => bvh.winding(p) > 0.5;
  const at = (i: number): Vec3 => [cloud[i] ?? 0, cloud[i + 1] ?? 0, cloud[i + 2] ?? 0];
  const inLeg = (p: Vec3): boolean =>
    e.traces.some((t) => {
      if (p[2] >= t.top) return false;
      const s = t.line.reduce((best, l) =>
        Math.abs(l[0] - p[2]) < Math.abs(best[0] - p[2]) ? l : best,
      );
      const low = p[2] < (t.line[2]?.[0] ?? 0);
      return dmath.hypot(p[0] - s[1], p[1] - s[2]) < (low ? t.paw * 1.4 : s[3] * 2.6) + H * 0.03;
    });
  /** The point that is farthest from `from` (plus `ahead` × how far in front of it, along +X). */
  const farthest = (from: Vec3, ok: (p: Vec3) => boolean, ahead = 0): Vec3 | null => {
    let [best, d] = [null as Vec3 | null, Number.NEGATIVE_INFINITY];
    for (let i = 0; i < cloud.length; i += 3) {
      const p = at(i);
      const l = v3.len(v3.sub(p, from)) + ahead * (p[0] - from[0]);
      if (l > d && ok(p)) [best, d] = [p, l];
    }
    return best;
  };
  const head = plan.find((x) => x.name === `${prefix}head`);
  const neck = chainOf(plan, prefix, 'neck');
  let yaw = 0;
  let tailRadius = 0;
  if (head) {
    const basePlan = neck[0]?.head ?? head.head;
    const bx = basePlan[0] + e.dxFore;
    const base = medial(
      bvh,
      [bx, e.section(bx)?.y ?? 0, basePlan[2]],
      v3.sub(head.head, basePlan),
      H * 0.12,
    ).at;
    const floor = Math.max(0, ...e.traces.map((t) => t.top));
    // Not a leg: on a short-necked, long-legged body (a bear) an elbow is farther from the neck's
    // base than the nose is. The fitted fore-leg bones are known by now.
    const legBones = [...pos]
      .filter(([name]) => /(fore|hind)_[lr]_\d+$/.test(name))
      .map(([, x]) => x);
    const onLeg = (p: Vec3): boolean =>
      legBones.some((x) => capsuleDistance(p, { a: x.head, b: x.tail }) < H * 0.12);
    const nose =
      farthest(base, (p) => p[0] > bx - H * 0.05 && p[2] > floor && !onLeg(p), NOSE_AHEAD) ??
      head.tail;
    const L = b.head.length;
    let [sum, n] = [[0, 0, 0] as Vec3, 0];
    for (let i = 0; i < cloud.length; i += 3) {
      const p = at(i);
      if (v3.len(v3.sub(p, nose)) > L * 0.75) continue;
      [sum, n] = [v3.add(sum, p), n + 1];
    }
    const u = v3.norm(v3.sub(nose, n ? v3.mul(sum, 1 / n) : head.head));
    let tail = v3.sub(nose, v3.mul(u, L * 0.1));
    for (let k = 0; k < 8 && !inside(tail); k++) tail = v3.sub(tail, v3.mul(u, L * 0.05));
    const reach = v3.len(v3.sub(head.tail, head.head));
    const atlas = medial(bvh, v3.sub(tail, v3.mul(u, reach)), u, L * 0.3).at;
    pos.set(head.name, { head: atlas, tail });
    yaw = (dmath.atan2(tail[1] - atlas[1], tail[0] - atlas[0]) * 180) / Math.PI;
    if (neck.length)
      writeChain(
        pos,
        neck,
        strung(bvh, [...neck.map((x) => x.head), head.head], base, atlas, H * 0.1),
      );
  }
  const tail = chainOf(plan, prefix, 'tail');
  const first = tail[0];
  if (first) {
    const parent = pos.get(first.parent ?? '');
    const root =
      parent && first.parent
        ? v3.add(
            first.head,
            v3.sub(parent.head, plan.find((x) => x.name === first.parent)?.head ?? parent.head),
          )
        : first.head;
    // The farthest point behind the croup that is not a leg and is flesh: a generator's thin
    // membrane between the hind legs is not a tail (three quarters of the way to the tip the
    // mesh must hold a ball of THICK × the height; else that find is struck out, up to 6 times).
    const struck: Vec3[] = [];
    const q: [number, number, number] = [0, 0, 0];
    let far: Vec3 | null = null;
    for (let tries = 0; tries < 6; tries++) {
      far = farthest(
        root,
        (p) =>
          p[0] < root[0] + H * 0.05 &&
          !inLeg(p) &&
          !struck.some((x) => v3.len(v3.sub(p, x)) < H * 0.08),
      );
      if (!far) break;
      const at = v3.lerp(root, far, 0.75);
      const m = medial(bvh, at, v3.sub(far, root), H * 0.08);
      if (m.inside && bvh.closest(m.at, q) >= H * THICK) break;
      struck.push(far);
      far = null;
    }
    // Nothing thick enough: a thin tail is still the tail (the first find).
    far = far ?? struck[0] ?? null;
    // A tail far longer than planned is not a tail (a stub tail's "tip" is the rump's far
    // corner): the bones then keep the plan's length along that direction.
    const chord = tail.reduce((l, x) => l + v3.len(v3.sub(x.tail, x.head)), 0);
    const reach = far ? v3.len(v3.sub(far, root)) : 0;
    const tip = far && reach > chord * TAIL_STRETCH ? v3.lerp(root, far, chord / reach) : far;
    if (tip) {
      const pts = strung(
        bvh,
        [...tail.map((x) => x.head), tail[tail.length - 1]?.tail ?? root],
        root,
        tip,
        H * 0.1,
      );
      const last = pts.length - 1;
      pts[last] = v3.lerp(tip, pts[last - 1] ?? root, 0.1);
      // The thinnest joint: the upper ones sit in the croup, whose radius is not the tail's.
      const radii = pts.slice(1, last).map((p) => bvh.closest(p, q));
      tailRadius = radii.length ? Math.min(...radii) : 0;
      writeChain(pos, tail, pts);
    }
  }
  return { headYaw: yaw, tailRadius };
}
