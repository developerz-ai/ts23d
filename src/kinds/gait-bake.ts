// Gait keys (ADR 013): per key the body pose (gait.ts) runs through forward kinematics, each
// scapula turns with its fore leg (rigs without one glide the shoulder), and every leg is solved — a stance leg with
// its toe locked (gait-ik.ts `solveStance`), a swing leg with its MCP on a ground-frame cycloid
// between the lift-off and touch-down solutions, the carpus folding and the hock flexing on the
// way (`solveSwing`), so stance and swing meet without a pop. Then the looping root-motion clip.

import { type Clip, dmath, type Quat, quatRotate, type Track, type Vec3 } from '../core/index.ts';
import {
  bodyPose,
  FEET,
  type Foot,
  footAt,
  type GaitSpec,
  type GaitTiming,
  gaitTiming,
  type QuadrupedRig,
  stanceTip,
  swingAlong,
} from './gait.ts';
import { pawVector, solveStance } from './gait-ik.ts';
import { swingLeg } from './gait-swing.ts';
import { type BoneWorld, forward, IDENTITY, qexp } from './pose.ts';

const TAU = Math.PI * 2;
/** Share of the leg's length change the hock / carpus takes in stance. */
const COUPLE: Readonly<Record<Foot, number>> = { lh: 0.5, rh: 0.5, lf: 0.6, rf: 0.6 };
/** Fore stance centre ahead of the rest paw, fraction of hip height [P]. */
const FORE_CENTRE = 0.02;
/** Share of the fore leg's swing (the pivot → toe line's angle) the scapula carries: the scapula
 *  is the main propulsive segment of the canid forelimb, ~ half its protraction-retraction
 *  (Fischer et al. 2002, J Exp Biol 205:1315; Fischer & Lilje 2011) [P: 0.5]. */
const SCAPULA_SHARE = 0.8;
/** Rigs without a scapula: the shoulder glides with the fore toe by this share, capped (fraction
 *  of hip) [P]. */
const GLIDE = 0.3;
const GLIDE_MAX = 0.1;

export interface GaitKey {
  readonly root: Vec3;
  readonly rot: Map<string, Quat>;
  /** Translations of non-root joints (the scapula glide), parent frame. */
  readonly offset: Map<string, Vec3>;
  /** Worst distance a planted toe misses its ground point by. */
  readonly miss: number;
}

const centre = (foot: Foot, hip: number): number => (foot[1] === 'f' ? FORE_CENTRE * hip : 0);

/** The body at φ and the world frame each leg hangs from. */
function bodyAt(g: GaitSpec, t: GaitTiming, rig: QuadrupedRig, phi: number, hip: number) {
  const body = bodyPose(g, rig, phi, hip);
  const offset = new Map<string, Vec3>();
  for (const foot of ['lf', 'rf'] as const) {
    const dx = footAt(g, t, foot, phi).dx + centre(foot, hip);
    const cap = GLIDE_MAX * hip;
    const glide: Vec3 = [Math.max(-cap, Math.min(cap, GLIDE * dx)), 0, 0];
    const leg0 = rig.legs[foot][0];
    const sc = rig.scapula?.[foot];
    const bone = sc ? rig.bones.find((b) => b.name === sc) : undefined;
    if (!bone) {
      offset.set(leg0.name, glide);
      continue;
    }
    // The scapula turns with the leg's line (shoulder → toe) by SCAPULA_SHARE, protracting with
    // the toe ahead; it also slides on the thorax, so the shoulder joint keeps the glide path
    // (the slide cancels the arc's rise): the humerus is left the rest of the swing.
    const line = dmath.atan2(dx, leg0.head[2]);
    const lim = bone.limit;
    const deg = Math.max(
      lim?.min ?? -90,
      Math.min(lim?.max ?? 90, (-SCAPULA_SHARE * line * 180) / Math.PI),
    );
    const q = qexp([0, (deg * Math.PI) / 180, 0]);
    body.rot.set(bone.name, q);
    const v: Vec3 = [
      bone.tail[0] - bone.head[0],
      bone.tail[1] - bone.head[1],
      bone.tail[2] - bone.head[2],
    ];
    const back = quatRotate(q, [v[0] + glide[0], v[1], v[2]], true);
    offset.set(leg0.name, [back[0] - v[0], back[1] - v[1], back[2] - v[2]]);
  }
  const world = forward(rig.bones, { rotation: body.rot, root: body.root, offset });
  const anchor = (foot: Foot): { A: Vec3; parent: Quat } => {
    const leg = rig.legs[foot];
    const a: BoneWorld | undefined = world.get(leg[0].name);
    const p = leg[0].parent ? world.get(leg[0].parent) : undefined;
    return { A: a?.head ?? leg[0].head, parent: p?.rot ?? IDENTITY };
  };
  return { body, offset, anchor };
}

/** The stance solution of `foot` at stance progress s, posed at the phase that progress falls on. */
function stanceSolve(
  g: GaitSpec,
  t: GaitTiming,
  rig: QuadrupedRig,
  foot: Foot,
  s: number,
  hip: number,
) {
  const phi = g.phase[foot] + s * g.duty;
  const leg = rig.legs[foot];
  const { anchor } = bodyAt(g, t, rig, phi, hip);
  const { A, parent } = anchor(foot);
  const st = stanceTip(g, t, s);
  const tip: Vec3 = [leg[3].tail[0] + st.dx + centre(foot, hip), leg[3].tail[1], leg[3].tail[2]];
  const M = pawVector(leg[3], st.roll).map((v, k) => v + (tip[k] ?? 0));
  return { solve: solveStance(leg, A, parent, tip, st.roll, COUPLE[foot]), M };
}

/** One key of the gait: root offset (no travel), local rotations, glides, worst toe miss. */
export function gaitPose(
  g: GaitSpec,
  t: GaitTiming,
  rig: QuadrupedRig,
  phi: number,
  hip: number,
): GaitKey {
  const { body, offset, anchor } = bodyAt(g, t, rig, phi, hip);
  let miss = 0;
  for (const foot of FEET) {
    const leg = rig.legs[foot];
    const f = footAt(g, t, foot, phi);
    const { A, parent } = anchor(foot);
    if (f.stance) {
      const st = stanceTip(g, t, f.s);
      const tip: Vec3 = [
        leg[3].tail[0] + st.dx + centre(foot, hip),
        leg[3].tail[1],
        leg[3].tail[2],
      ];
      const solve = solveStance(leg, A, parent, tip, st.roll, COUPLE[foot]);
      miss = Math.max(miss, solve.miss);
      leg.forEach((b, i) => {
        body.rot.set(b.name, solve.local[i] ?? IDENTITY);
      });
    } else {
      const lo = stanceSolve(g, t, rig, foot, 1, hip);
      const td = stanceSolve(g, t, rig, foot, 0, hip);
      const M = (s: number): Vec3 => {
        const c = s - dmath.sin(TAU * s) / TAU;
        return [
          swingAlong(g, t, s, lo.M[0] ?? 0, td.M[0] ?? 0),
          (lo.M[1] ?? 0) + ((td.M[1] ?? 0) - (lo.M[1] ?? 0)) * c,
          (lo.M[2] ?? 0) +
            ((td.M[2] ?? 0) - (lo.M[2] ?? 0)) * c +
            g.lift * hip * 0.5 * (1 - dmath.cos(TAU * s)),
        ];
      };
      const local = swingLeg(leg, A, parent, f.s, {
        M,
        lo: lo.solve,
        td: td.solve,
        lift: g.lift * hip,
        fore: foot[1] === 'f',
      });
      leg.forEach((b, i) => {
        body.rot.set(b.name, local[i] ?? IDENTITY);
      });
    }
  }
  return { root: body.root, rot: body.rot, offset, miss };
}

/** Keys per second of baked clips. */
export const FPS = 30;

/** Sample `n + 1` keys over one cycle; key n repeats key 0 so the loop closes exactly. */
export function bakeKeys<T>(
  seconds: number,
  sample: (phi: number) => T,
): { times: Float32Array; keys: T[] } {
  const n = Math.max(4, Math.round(seconds * FPS));
  const keys = Array.from({ length: n }, (_, i) => sample(i / n));
  keys.push(keys[0] as T);
  return { times: Float32Array.from({ length: n + 1 }, (_, i) => (i * seconds) / n), keys };
}

/** Rotation tracks for every bone that turns somewhere in the keys (bone order). */
export function rotationTracks(
  bones: readonly { readonly name: string }[],
  times: Float32Array,
  keys: readonly ReadonlyMap<string, Quat>[],
): Track[] {
  const out: Track[] = [];
  for (const b of bones) {
    const qs = keys.map((k) => k.get(b.name) ?? IDENTITY);
    if (qs.every((q) => Math.abs(q[3]) > 1 - 1e-12)) continue;
    // Keep consecutive keys in one hemisphere so the engine interpolates the short way.
    const values = new Float32Array(qs.length * 4);
    let prev: Quat = IDENTITY;
    qs.forEach((q, i) => {
      const s = q[0] * prev[0] + q[1] * prev[1] + q[2] * prev[2] + q[3] * prev[3] < 0 ? -1 : 1;
      const r: Quat = [q[0] * s, q[1] * s, q[2] * s, q[3] * s];
      values.set(r, i * 4);
      prev = r;
    });
    out.push({ bone: b.name, path: 'rotation', times, values });
  }
  return out;
}

/** Follow-through on top of the keyed rotations (springs.ts), given the root path and step. */
export type KeyPost = (
  keys: ReadonlyMap<string, Quat>[],
  roots: Vec3[],
  seconds: number,
) => Map<string, Quat>[];

/** A looping root-motion clip of `gait`: speed = stride ÷ seconds (the manifest's root speed). */
export function gaitClip(
  name: string,
  rig: QuadrupedRig,
  gait: GaitSpec,
  hip: number,
  post: KeyPost = (k) => k.map((m) => new Map(m)),
): { clip: Clip; timing: GaitTiming; miss: number } {
  const t = gaitTiming(gait, hip);
  const { times, keys } = bakeKeys(t.seconds, (phi) => gaitPose(gait, t, rig, phi, hip));
  const miss = Math.max(...keys.map((k) => k.miss));
  const n = keys.length - 1;
  const roots = keys.map((k, i): Vec3 => [(t.stride * i) / n, k.root[1], k.root[2]]);
  const rots = post(
    keys.map((k) => k.rot),
    roots,
    t.seconds,
  );
  const translation: Track = {
    bone: rig.spine[0] ?? '',
    path: 'translation',
    times,
    values: Float32Array.from(roots.flat()),
  };
  const glides = [...(keys[0]?.offset.keys() ?? [])].map(
    (bone): Track => ({
      bone,
      path: 'translation',
      times,
      values: Float32Array.from(keys.flatMap((k) => [...(k.offset.get(bone) ?? [0, 0, 0])])),
    }),
  );
  return {
    clip: {
      name,
      seconds: t.seconds,
      loop: true,
      tracks: [translation, ...glides, ...rotationTracks(rig.bones, times, rots)],
    },
    timing: t,
    miss,
  };
}
