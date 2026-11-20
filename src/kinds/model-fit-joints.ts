// Registration from a rigger's joints (model-rig.ts `register: 'joints'`): the similarity that
// lands a model on its creature plan read off the rigger's armature instead of off the surface.
// Surface matching (model-fit.ts) pairs the model's skin with the plan's flesh, and a body that
// carries what the plan does not (raised wings: a third of a dragon's surface) is pulled off it.
// The joints say where the animal is whatever rides on its back: the yaw turns hips → shoulders
// onto +X, the scale sets the mean hip and shoulder height to the plan's, the place puts the
// middle of hips and shoulders on the plan's and the lowest vertex on the ground. The armature
// is read in ITS OWN frame (Z up, any yaw), so nothing here assumes which way it faces: the fore
// pair is the one whose end of the body rises higher (a head) than the other's (a tail).

import { type Bone, dmath, type Mesh, Ts23dError, type Vec3 } from '../core/index.ts';
import { applySimilarity, type Similarity } from '../primitives/index.ts';
import type { Bones } from './creature-bones.ts';
import { rigBones } from './creature-limits.ts';
import { type ModelFit, matrixOf } from './model-fit.ts';

const fail = (cause: string): never => {
  throw new Ts23dError('T3D_MODEL_SKELETON', {
    cause: `registration from joints: ${cause}`,
    fix: "the rigger's armature does not read as this quadruped: register on the surface instead (drop `register: 'joints'`), or re-roll the concept in a square stand",
  });
};

const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

/** The similarity (yaw about Z, uniform scale, translation) from `joints` to the plan `b`. */
export function jointsFit(mesh: Mesh, b: Bones, joints: readonly Bone[], prefix = ''): ModelFit {
  const byName = new Map(joints.map((j) => [j.name, j]));
  const kids = new Map<string, Bone[]>();
  for (const j of joints) if (j.parent) kids.set(j.parent, [...(kids.get(j.parent) ?? []), j]);
  const leaves = joints.filter((j) => !kids.has(j.name));
  // A leaf's chain back to the bone where the armature forks.
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
  const floor0 = Math.min(...joints.flatMap((j) => [j.head[2], j.tail[2]]));
  const top = Math.max(...joints.flatMap((j) => [j.head[2], j.tail[2]]));
  const end = (c: readonly Bone[]): number => c[c.length - 1]?.tail[2] ?? 0;
  // Limbs are found by where they hang, not by how low they end: every long chain that reaches
  // the ground is grouped by the trunk bone it hangs from, and a group's pair is its two most
  // alike chains (a tail hanging from the hips beside the hind legs, ending under the toes, is
  // the odd one out: legs of a pair have one length and end at one height).
  const low = leaves
    .map(chainOf)
    .filter((c) => c.length >= 4 && end(c) <= floor0 + (top - floor0) * 0.15);
  const reach = (c: readonly Bone[]): number =>
    c.reduce(
      (t, j) =>
        t + dmath.hypot(j.tail[0] - j.head[0], j.tail[1] - j.head[1], j.tail[2] - j.head[2]),
      0,
    );
  const groups = new Map<string, Bone[][]>();
  for (const c of low) {
    const at = c[0]?.parent ?? '';
    groups.set(at, [...(groups.get(at) ?? []), c]);
  }
  const two = [...groups.values()]
    .filter((g) => g.length >= 2)
    .map((g) => {
      let best: Bone[][] = g.slice(0, 2);
      let cost = Infinity;
      g.forEach((x, m) => {
        g.slice(m + 1).forEach((y) => {
          const d = Math.abs(reach(x) - reach(y)) + Math.abs(end(x) - end(y));
          if (d < cost) [best, cost] = [[x, y], d];
        });
      });
      return best;
    });
  const legs = two.flat();
  const [p, q] = two;
  if (two.length !== 2 || !p || !q)
    return fail(
      `${two.length} pair(s) of limb chains reach the ground from the trunk, a quadruped has 2`,
    );
  const root = (pair: Bone[][]): Vec3 =>
    mid(pair[0]?.[0]?.head ?? [0, 0, 0], pair[1]?.[0]?.head ?? [0, 0, 0]);
  const [a, c] = [root(p), root(q)];
  // The ends of the body past each pair: the other leaves, by which pair they lie beyond.
  const inLeg = new Set(legs.flat().map((j) => j.name));
  const along = (x: Vec3): number => (x[0] - a[0]) * (c[0] - a[0]) + (x[1] - a[1]) * (c[1] - a[1]);
  const span = along(c);
  const ends = leaves.filter((j) => !inLeg.has(j.name));
  const beyondC = ends.filter((j) => along(j.tail) > span).map((j) => j.tail[2]);
  const beyondA = ends.filter((j) => along(j.tail) < 0).map((j) => j.tail[2]);
  if (!beyondC.length && !beyondA.length) fail('no head or tail bone past the limbs');
  // The head end rises higher than the tail end; with one end only, that end is the head.
  const cIsFore =
    !beyondA.length || (beyondC.length > 0 && Math.max(...beyondC) > Math.max(...beyondA));
  // Level first: the plane through the four feet (least squares) is turned flat, so a model
  // generated leaning stands on all four (never more than LEVEL°).
  const tilt = levelOf(legs.map((l) => l[l.length - 1]?.tail ?? [0, 0, 0]));
  const up = (x: Vec3): Vec3 => applySimilarity({ s: 1, r: tilt, t: [0, 0, 0] }, x);
  const [hips, shoulders] = (cIsFore ? [a, c] : [c, a]).map(up) as [Vec3, Vec3];
  const floor = Math.min(...joints.flatMap((j) => [up(j.head)[2], up(j.tail)[2]]));
  const yaw = -dmath.atan2(shoulders[1] - hips[1], shoulders[0] - hips[0]);
  const [cs, sn] = [dmath.cos(yaw), dmath.sin(yaw)];
  const z = [cs, -sn, 0, sn, cs, 0, 0, 0, 1];
  // r = yaw about Z ∘ level.
  const r = [0, 1, 2].flatMap((i) =>
    [0, 1, 2].map((k) =>
      [0, 1, 2].reduce((t, m) => t + (z[i * 3 + m] ?? 0) * (tilt[m * 3 + k] ?? 0), 0),
    ),
  );
  const plan = rigBones(b, null, null, prefix);
  const at = (n: string): Vec3 => plan.find((x) => x.name === `${prefix}${n}`)?.head ?? [0, 0, 0];
  const [ph, pf] = [mid(at('hind_l_0'), at('hind_r_0')), mid(at('fore_l_0'), at('fore_r_0'))];
  const s = (ph[2] + pf[2]) / Math.max(hips[2] - floor + (shoulders[2] - floor), 1e-9);
  if (!(s > 0 && Number.isFinite(s))) fail('the hips and shoulders are not above the feet');
  // The joints only say roughly where the soles are. Level again on the skin itself: the lowest
  // vertex within a paw's length of each foot joint, the plane through those four turned flat.
  const P = mesh.positions;
  const multiply = (x: readonly number[], y: readonly number[]): number[] =>
    [0, 1, 2].flatMap((i) =>
      [0, 1, 2].map((k) =>
        [0, 1, 2].reduce((t, n) => t + (x[i * 3 + n] ?? 0) * (y[n * 3 + k] ?? 0), 0),
      ),
    );
  const feet = legs.map((l) => {
    const last = l[l.length - 1];
    const reach = last
      ? dmath.hypot(
          last.tail[0] - last.head[0],
          last.tail[1] - last.head[1],
          last.tail[2] - last.head[2],
        )
      : 0;
    return {
      at: last?.tail ?? ([0, 0, 0] as Vec3),
      reach: Math.max(reach, (top - floor0) * 0.04) * s,
    };
  });
  const solesOf = (sim: Similarity): Vec3[] => {
    const centres = feet.map((f) => applySimilarity(sim, f.at));
    const low: Vec3[] = centres.map((c) => [c[0], c[1], Infinity]);
    for (let i = 0; i < P.length; i += 3) {
      const v = applySimilarity(sim, [P[i] ?? 0, P[i + 1] ?? 0, P[i + 2] ?? 0]);
      centres.forEach((c, k) => {
        const best = low[k];
        if (
          best &&
          v[2] < best[2] &&
          dmath.hypot(v[0] - c[0], v[1] - c[1]) <= (feet[k]?.reach ?? 0)
        )
          low[k] = v;
      });
    }
    return low.map((v, k) => (Number.isFinite(v[2]) ? v : (centres[k] ?? v)));
  };
  let rot = r;
  for (let pass = 0; pass < 2; pass++)
    rot = multiply(levelOf(solesOf({ s, r: rot, t: [0, 0, 0] })), rot);
  const turned: Similarity = { s, r: rot, t: [0, 0, 0] };
  const [h0, s0] = cIsFore ? [a, c] : [c, a];
  const m = mid(applySimilarity(turned, h0), applySimilarity(turned, s0));
  const ground = Math.min(...solesOf(turned).map((v) => v[2]));
  const similarity: Similarity = {
    s,
    r: rot,
    t: [(ph[0] + pf[0]) / 2 - m[0], -m[1], -(Number.isFinite(ground) ? ground : 0)],
  };
  // No surface residual is measured here: QA `model` judges the fit (joints inside, hugTurn).
  return {
    similarity,
    matrix: matrixOf(similarity),
    residual: 0,
    relative: 0,
    yaw: (yaw * 180) / Math.PI,
    scale: s,
  };
}

/** Most a leaning model is turned to stand level, degrees. */
const LEVEL = 15;

/** The rotation (row-major 3×3) that turns the least-squares plane through `feet` horizontal. */
function levelOf(feet: readonly Vec3[]): number[] {
  const n = feet.length;
  const mean = [0, 1, 2].map((k) => feet.reduce((t, f) => t + (f[k] ?? 0), 0) / n);
  let [sxx, sxy, syy, sxz, syz] = [0, 0, 0, 0, 0];
  for (const f of feet) {
    const [x, y, z] = [f[0] - (mean[0] ?? 0), f[1] - (mean[1] ?? 0), f[2] - (mean[2] ?? 0)];
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
    sxz += x * z;
    syz += y * z;
  }
  const det = sxx * syy - sxy * sxy;
  if (Math.abs(det) < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  // z = a·x + b·y: the plane's normal is (−a, −b, 1).
  const [a, b] = [(sxz * syy - syz * sxy) / det, (syz * sxx - sxz * sxy) / det];
  const l = dmath.hypot(a, b, 1);
  const nrm: Vec3 = [-a / l, -b / l, 1 / l];
  const angle = dmath.acos(Math.min(1, nrm[2]));
  if (angle < 1e-9) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (angle > (LEVEL * Math.PI) / 180)
    fail(`the four feet lie ${((angle * 180) / Math.PI).toFixed(1)}° off level (most ${LEVEL}°)`);
  // Rodrigues: turn `nrm` onto +Z about the axis nrm × Z.
  const k: Vec3 = [nrm[1] / dmath.sin(angle), -nrm[0] / dmath.sin(angle), 0];
  const [c, sn] = [dmath.cos(angle), dmath.sin(angle)];
  const [x, y] = [k[0], k[1]];
  return [
    c + x * x * (1 - c),
    x * y * (1 - c),
    y * sn,
    x * y * (1 - c),
    c + y * y * (1 - c),
    -x * sn,
    -y * sn,
    x * sn,
    c,
  ];
}
