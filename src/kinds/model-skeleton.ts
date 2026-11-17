// fitSkeleton: the plan's armature fitted INTO a registered model mesh, whose pose is not our rest
// pose (head turned to the camera, legs wherever the photo had them). Names, order and parents are
// the plan's; only joint positions move:
//   legs   — joints on each leg's centre line (model-legs.ts) at the plan's heights; above the
//            belly, the plan's joint carried by the leg's offset; toes along the sole
//   spine  — plan x shifted with the hips and shoulders, centred in the trunk's section, just
//            under the dorsal line
//   neck, head, tail — model-ends.ts (the head is wherever the model turned it)
// Every joint must end inside the mesh, and no leg bone may stretch past STRETCH: else
// T3D_MODEL_SKELETON. Memoised per positions array.

import { type Bone, type Mesh, Ts23dError, type Vec3 } from '../core/index.ts';
import { triBvh } from '../primitives/index.ts';
import type { Bones } from './creature-bones.ts';
import { v3 } from './creature-curve.ts';
import { MID, midBones } from './creature-helpers.ts';
import { rigBones } from './creature-limits.ts';
import { chainOf, fitEnds, type Pts, writeChain } from './model-ends.ts';
import { type LegTrace, legAt, traceLegs } from './model-legs.ts';
import { levelsOf, medial, surfaceCloud } from './model-sections.ts';

/** A leg bone may be this much shorter or longer than the plan's (ratio either way). Measured on
 *  the Pixal3D wolf: 0.87–1.07 over the sixteen leg bones (its neck: 0.47, its tail: up to 1.5). */
export const STRETCH: readonly [number, number] = [0.6, 1.6];
/** The short bones below the hock and carpus (a few centimetres long: a lifted heel halves
 *  them): the profile bear's raised fore paw gave 0.56. */
export const DISTAL_STRETCH: readonly [number, number] = [0.4, 2.5];
const within = (x: number, band: readonly [number, number]): boolean =>
  x >= band[0] && x <= band[1];

export interface JointResidual {
  readonly bone: string;
  /** How far the bone's head moved from the plan, metres. */
  readonly moved: number;
  /** Fitted length ÷ plan length. */
  readonly stretch: number;
}

export interface FittedSkeleton {
  /** The plan's bones at their fitted places (limits kept), then the `_mid` helpers. */
  readonly bones: readonly Bone[];
  readonly residuals: readonly JointResidual[];
  /** Height each leg is free to (below it the leg is its own limb), by chain: `fore_l` … */
  readonly legTop: Readonly<Record<string, number>>;
  /** Each free leg's traced centre line, by chain (model-bind.ts keeps limbs apart with it). */
  readonly legs: Readonly<Record<string, LegTrace>>;
  /** Where the model turned its head: yaw of the head bone off +X, degrees (+ = to its left). */
  readonly headYaw: number;
  /** The tail's smallest inscribed radius at its joints, metres (0 without a tail). */
  readonly tailRadius: number;
}

const memo = new WeakMap<Float32Array, WeakMap<Bones, Map<string, FittedSkeleton>>>();

/** The plan's armature fitted into `mesh` (registered: modelFit). `strict: false` returns a fit
 *  that would throw (joints outside, torn leg bones) so its residuals can be read. */
export function fitSkeleton(mesh: Mesh, b: Bones, prefix = '', strict = true): FittedSkeleton {
  // The plan and the strictness are part of the key: a lenient fit must not answer a strict ask,
  // nor one plan's fit another's.
  const key = `${strict ? 'strict' : 'lenient'}:${prefix}`;
  const seen = memo.get(mesh.positions)?.get(b)?.get(key);
  if (seen) return seen;
  const H = b.height;
  const plan = rigBones(b, null, null, prefix).filter((x) => !x.name.endsWith(MID));
  const bvh = triBvh(mesh);
  const cell = H / 50;
  const cloud = surfaceCloud(mesh, cell * 0.5);
  const lv = levelsOf(cloud, cell, H / 40);
  const pos: Pts = new Map(plan.map((x) => [x.name, { head: x.head, tail: x.tail }]));
  const inside = (p: Vec3): boolean => bvh.winding(p) > 0.5;
  const settle = (p: Vec3, axis: Vec3): Vec3 => (inside(p) ? p : medial(bvh, p, axis, H * 0.12).at);

  // Legs.
  const stems = ['fore_l', 'fore_r', 'hind_l', 'hind_r'].filter(
    (s) => chainOf(plan, prefix, s).length > 0,
  );
  const chains = stems.map((s) => chainOf(plan, prefix, s));
  const polys = chains.map((c): Vec3[] => [
    ...c.map((x) => x.head),
    c[c.length - 1]?.tail ?? [0, 0, 0],
  ]);
  const feet = polys.map((p): Vec3 => p[p.length - 2] ?? [0, 0, 0]);
  const free = polys.map((p) => {
    const [knee, ankle] = [p[p.length - 4] ?? p[0], p[p.length - 3] ?? p[0]];
    return knee && ankle ? ankle[2] + (knee[2] - ankle[2]) * 0.35 : 0;
  });
  // The belly (or crotch): the lowest surface on the mid-plane between the feet, clear of them.
  const fx = feet.map((f) => f[0]);
  const [xa, xb] = [Math.min(...fx, 0), Math.max(...fx, 0)];
  const pad = xb - xa > H * 0.2 ? (xb - xa) * 0.25 : -H * 0.1;
  let belly = Infinity;
  for (let i = 0; i < cloud.length; i += 3) {
    const [x, y] = [cloud[i] ?? 0, cloud[i + 1] ?? 0];
    if (x > xa + pad && x < xb - pad && Math.abs(y) < cell * 1.5)
      belly = Math.min(belly, cloud[i + 2] ?? 0);
  }
  const traces = chains.length
    ? traceLegs(
        lv,
        bvh,
        feet,
        free,
        feet.map(() => belly),
      )
    : [];
  const legTop: Record<string, number> = {};
  const shift = { fore: [] as number[], hind: [] as number[] };
  chains.forEach((chain, i) => {
    const [t, poly, stem] = [traces[i], polys[i] ?? [], stems[i] ?? ''];
    if (!t) return;
    legTop[stem] = t.top;
    const zFree = t.top - lv.dz;
    // The plan's own leg line at the top of the free leg: the offset carried into the trunk.
    const planAt = (z: number): [number, number] => {
      for (let k = 1; k < poly.length; k++) {
        const [hi, lo] = [poly[k - 1], poly[k]];
        if (!hi || !lo || z < lo[2] || hi[2] <= lo[2]) continue;
        const u = Math.min(1, (z - lo[2]) / (hi[2] - lo[2]));
        return [lo[0] + (hi[0] - lo[0]) * u, lo[1] + (hi[1] - lo[1]) * u];
      }
      return [poly[0]?.[0] ?? 0, poly[0]?.[1] ?? 0];
    };
    const [fx, fy] = legAt(t, zFree);
    const [px, py] = planAt(zFree);
    const rootZ = poly[0]?.[2] ?? H;
    const fitted = poly.map((p, k): Vec3 => {
      if (k === poly.length - 1) return p;
      const [lx, ly] = legAt(t, p[2]);
      if (p[2] <= zFree) return [lx, ly, p[2]];
      const w = 1 - 0.65 * Math.min(1, (p[2] - zFree) / Math.max(rootZ - zFree, 1e-6));
      const next = poly[k + 1] ?? p;
      return settle([p[0] + (fx - px) * w, p[1] + (fy - py) * w, p[2]], v3.sub(next, p));
    });
    // A segment that lies along the ground in the plan (a plantigrade foot: heel → toes) cannot be
    // read off section heights: it keeps the plan's own offset from the joint above it.
    for (let k = 1; k < poly.length - 1; k++) {
      const [a, c, up] = [poly[k - 1], poly[k], fitted[k - 1]];
      if (!a || !c || !up) continue;
      const d = v3.sub(c, a);
      if (Math.abs(d[2]) < 0.5 * v3.len(d)) fitted[k] = settle(v3.add(up, d), d);
    }
    const ankle = fitted[fitted.length - 2] ?? [0, 0, 0];
    const tip = poly[poly.length - 1] ?? ankle;
    const paw = Math.hypot(tip[0] - (feet[i]?.[0] ?? 0), tip[1] - (feet[i]?.[1] ?? 0));
    fitted[fitted.length - 1] = [ankle[0] + t.toe[0] * paw, ankle[1] + t.toe[1] * paw, tip[2]];
    writeChain(pos, chain, fitted);
    shift[stem.startsWith('fore') ? 'fore' : 'hind'].push(
      (fitted[0]?.[0] ?? 0) - (poly[0]?.[0] ?? 0),
    );
    const sc = stem.startsWith('fore')
      ? plan.find((x) => x.name === `${prefix}scapula_${stem.slice(-1)}`)
      : undefined;
    const root = fitted[0];
    if (sc && root && poly[0]) {
      const head = v3.add(sc.head, v3.sub(root, poly[0]));
      pos.set(sc.name, { head: settle(head, v3.sub(root, head)), tail: root });
    }
  });
  const mean = (v: number[]): number => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
  const dxHind = mean(shift.hind.length ? shift.hind : shift.fore);
  const dxFore = mean(shift.fore.length ? shift.fore : shift.hind);
  const trunkFloor = Math.max(0, ...Object.values(legTop));

  // Spine (legged bodies with a dorsal line; a body chain keeps the plan's).
  const spine = chainOf(plan, prefix, 'spine');
  const xs = polys.map((p) => p[0]?.[0] ?? 0);
  const [x0, x1] = [Math.min(...xs, 0), Math.max(...xs, 0)];
  const carry = (x: number): number =>
    dxHind + (dxFore - dxHind) * Math.min(1, Math.max(0, (x - x0) / Math.max(x1 - x0, 1e-6)));
  const section = (x: number): { y: number; top: number } | null => {
    let [lo, hi, top, n] = [Infinity, -Infinity, -Infinity, 0];
    for (let i = 0; i < cloud.length; i += 3) {
      if (Math.abs((cloud[i] ?? 0) - x) > cell || (cloud[i + 2] ?? 0) < trunkFloor) continue;
      [lo, hi] = [Math.min(lo, cloud[i + 1] ?? 0), Math.max(hi, cloud[i + 1] ?? 0)];
      top = Math.max(top, cloud[i + 2] ?? 0);
      n++;
    }
    return n >= 8 ? { y: (lo + hi) / 2, top } : null;
  };
  const dorsal = (p: Vec3): Vec3 => {
    for (let k = 0; k < 12; k++) {
      const x = p[0] + carry(p[0]) - Math.sign(p[0]) * k * cell;
      const s = section(x);
      if (s) return settle([x, s.y, s.top - H * 0.06], [1, 0, 0]);
    }
    return p;
  };
  if (spine.length && chains.length && b.chain.length < 2)
    writeChain(
      pos,
      spine,
      [...spine.map((x) => x.head), spine[spine.length - 1]?.tail ?? [0, 0, 0]].map(dorsal),
    );
  const ends = fitEnds({ pos, plan, prefix, b, bvh, cloud, traces, dxFore, section });

  const bones = plan.map(
    (x): Bone => ({ ...x, ...(pos.get(x.name) ?? { head: x.head, tail: x.tail }) }),
  );
  const len = (x: { head: Vec3; tail: Vec3 }): number => v3.len(v3.sub(x.tail, x.head));
  const residuals = plan.map((x, i): JointResidual => {
    const f = bones[i] ?? x;
    return { bone: x.name, moved: v3.len(v3.sub(f.head, x.head)), stretch: len(f) / len(x) };
  });
  const outside = bones.filter((x) => !inside(x.head)).map((x) => x.name);
  const torn = residuals.filter(
    (r) =>
      /^(fore|hind)_[lr]_\d+$/.test(r.bone.slice(prefix.length)) &&
      !within(r.stretch, /_[01]$/.test(r.bone) ? STRETCH : DISTAL_STRETCH),
  );
  if (strict && (outside.length || torn.length))
    throw new Ts23dError('T3D_MODEL_SKELETON', {
      cause: `model skeleton: ${[
        outside.length ? `joint(s) outside the mesh: ${outside.join(', ')}` : '',
        ...torn.map((r) => `${r.bone} is ${r.stretch.toFixed(2)}× its plan length`),
      ]
        .filter(Boolean)
        .join('; ')}`,
      fix: "the model does not have the plan's build or stance there: correct the spec (leg lengths, neck, tail) from the sources, or re-roll the concept in a square neutral stand; else fall back to the code creature",
    });
  const out: FittedSkeleton = {
    bones: [...bones, ...midBones(bones, prefix)],
    residuals,
    legTop,
    legs: Object.fromEntries(stems.flatMap((st, i) => (traces[i] ? [[st, traces[i]]] : []))),
    headYaw: ends.headYaw,
    tailRadius: ends.tailRadius,
  };
  const plans = memo.get(mesh.positions) ?? new WeakMap<Bones, Map<string, FittedSkeleton>>();
  const per = plans.get(b) ?? new Map<string, FittedSkeleton>();
  per.set(key, out);
  plans.set(b, per);
  memo.set(mesh.positions, plans);
  return out;
}
