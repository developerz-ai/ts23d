// Baked follow-through (ADR 013: springs run here, never in the engine). Each chain bone (tail,
// ears, jowls) is a damped angular spring about its head, driven by the acceleration of that head:
// α = −(d × a) ÷ L for a bone of length L pointing along d, swung about the two axes across the
// bone. Fixed-step semi-implicit Euler over the looping pose sequence; instead of a warm-up loop
// the integrator's affine one-loop map x_T = M·x_0 + b is solved for its fixed point, so the kept
// loop starts on the periodic orbit and its seam closes to float precision. Bones are solved
// parent first: a child feels its parent's spring motion.

import { type Bone, type Quat, quatRotate, type Vec3 } from '../core/index.ts';
import { forward, IDENTITY, qconj, qexp, qmul } from './pose.ts';

export interface SpringBone {
  readonly bone: string;
  /** Natural frequency, Hz. */
  readonly hz: number;
  /** Damping ratio (0 = undamped, 1 = critical). */
  readonly damping: number;
  /** Largest swing either way, degrees: a louder response is scaled down to it. */
  readonly max?: number;
}

/** Integrator substeps per key. */
const SUB = 8;

type State = readonly [number, number];

/** One loop of θ'' = f − ω²θ − 2ζωθ' (f per key, held over its substeps); θ at every key. */
function loop(
  f: readonly number[],
  dt: number,
  w: number,
  z: number,
  x0: State,
): { end: State; at: number[] } {
  let [x, v] = x0;
  const at: number[] = [];
  for (const fk of f) {
    at.push(x);
    for (let s = 0; s < SUB; s++) {
      v += (fk - w * w * x - 2 * z * w * v) * dt;
      x += v * dt;
    }
  }
  return { end: [x, v], at };
}

/** The periodic response to forcing `f` over one loop (keys at uniform steps of `step` s). */
export function periodicResponse(
  f: readonly number[],
  step: number,
  hz: number,
  damping: number,
): number[] {
  const w = 2 * Math.PI * hz;
  const dt = step / SUB;
  const zero = f.map(() => 0);
  const b = loop(f, dt, w, damping, [0, 0]).end;
  const c1 = loop(zero, dt, w, damping, [1, 0]).end;
  const c2 = loop(zero, dt, w, damping, [0, 1]).end;
  // (I − M) x0 = b, M = [c1 c2] column-wise.
  const a11 = 1 - c1[0];
  const a12 = -c2[0];
  const a21 = -c1[1];
  const a22 = 1 - c2[1];
  const det = a11 * a22 - a12 * a21;
  const x0: State = [(b[0] * a22 - a12 * b[1]) / det, (a11 * b[1] - a21 * b[0]) / det];
  return loop(f, dt, w, damping, x0).at;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
};
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mix = (a: Vec3, s: number, b: Vec3, t: number): Vec3 => [
  a[0] * s + b[0] * t,
  a[1] * s + b[1] * t,
  a[2] * s + b[2] * t,
];

/** Two axes across a bone direction (horizontal first where it has one). */
function across(d: Vec3): [Vec3, Vec3] {
  const e1 = unit(Math.abs(d[2]) > 0.95 ? cross(d, [1, 0, 0]) : cross(d, [0, 0, 1]));
  return [e1, cross(d, e1)];
}

/**
 * Spring rotations for `springs` over one loop of poses (`keys[i]` local rotations, `roots[i]`
 * root translations, keys `step` s apart, the loop moving the root by `travel`). Returns each
 * key's poses with the springs composed after the keyed rotations.
 */
export function bakeSprings(
  bones: readonly Bone[],
  keys: readonly ReadonlyMap<string, Quat>[],
  roots: readonly Vec3[],
  step: number,
  springs: readonly SpringBone[],
  travel: Vec3 = [0, 0, 0],
): Map<string, Quat>[] {
  const out = keys.map((k) => new Map(k));
  const n = keys.length;
  const byName = new Map(bones.map((b) => [b.name, b]));
  const order = [...springs].sort(
    (a, b) => bones.findIndex((x) => x.name === a.bone) - bones.findIndex((x) => x.name === b.bone),
  );
  for (const s of order) {
    const bone = byName.get(s.bone);
    if (!bone) continue;
    const worlds = out.map((k, i) => forward(bones, { rotation: k, root: roots[i] ?? [0, 0, 0] }));
    const head = (i: number): Vec3 => {
      const j = ((i % n) + n) % n;
      const h = worlds[j]?.get(s.bone)?.head ?? bone.head;
      const k = Math.floor(i / n);
      return [h[0] + travel[0] * k, h[1] + travel[1] * k, h[2] + travel[2] * k];
    };
    const rest = sub(bone.tail, bone.head);
    const L = Math.hypot(...rest);
    const [e1, e2] = across(unit(rest));
    const f1: number[] = [];
    const f2: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = mix(
        sub(head(i + 1), head(i)),
        1 / (step * step),
        sub(head(i - 1), head(i)),
        1 / (step * step),
      );
      const w = worlds[i]?.get(s.bone);
      const parentRot = bone.parent ? (worlds[i]?.get(bone.parent)?.rot ?? IDENTITY) : IDENTITY;
      const d = unit(quatRotate(w?.rot ?? IDENTITY, rest));
      const alpha = quatRotate(qconj(parentRot), mix(cross(d, a), -1 / L, d, 0));
      f1.push(dot(alpha, e1));
      f2.push(dot(alpha, e2));
    }
    const t1 = periodicResponse(f1, step, s.hz, s.damping);
    const t2 = periodicResponse(f2, step, s.hz, s.damping);
    const peak = Math.max(...t1.map((x, i) => Math.hypot(x, t2[i] ?? 0)));
    const cap = ((s.max ?? 25) * Math.PI) / 180;
    const k = peak > cap ? cap / peak : 1;
    out.forEach((m, i) => {
      const r = mix(e1, (t1[i] ?? 0) * k, e2, (t2[i] ?? 0) * k);
      m.set(s.bone, qmul(qexp(r), m.get(s.bone) ?? IDENTITY));
    });
  }
  return out;
}
