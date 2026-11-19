// The drake's wing bones (kinds `ExtraChain`): the rigger returns a quadruped and no wing joints,
// so the two chains are found on the proxy mesh the skeleton is fitted into, not placed by hand,
// and a re-rolled mesh keeps them.
//   wing     what stands more than 0.3 h off every trunk bone, above the back (the same rule the
//            Blender build step scales by, steps.ts)
//   tip      the wing's point farthest from its root: the end of the leading finger
//   line     the cheapest path through the solid from the tip to the withers (kinds `tracePath`):
//            down the leading finger, through the wrist where the fingers meet, down the arm
//   joints   shoulder (where the line leaves the wing for the back: the scale's fixed end),
//            wrist (the line's corner: its point farthest from the shoulder–tip chord), the
//            middle of the finger, the tip
// Three bones a side, wing_l_0..2 and wing_r_0..2, hung from spine_2. Each hinges about the
// body's long axis, the stroke a wing raised in a V can make without its membrane leaving the
// back. The joints are given in the fitted rest AFTER the build step has scaled and lowered the
// wings (the mesh Blender binds); the centres go to that step from here, so both sides of the
// chain agree.

import {
  type Bone,
  type ExtraChain,
  type ExtraFit,
  type JointLimit,
  tracePath,
  type Vec3,
} from '@developerz.ai/ts23d';

/** Wing scale about the wing roots. At 600 kg the generator's wings (a V 2.8 m wide) read as a
 *  hatchling's, and at ×1.25 the raised V still measured 3.3 m across a 4.9 m animal: the span
 *  read as decorative. ×1.4, and lowered by WING_TILT, the wings spread about as wide as the
 *  animal is long. Still far short of flight for the mass, as on every heavy fantasy drake:
 *  README.md, "Wings". */
export const WING_SCALE = 1.4;

/** Degrees each wing is lowered about the body's long axis through its root: the generator
 *  raised them 52° above the horizon (a narrow V); at 30° they read as a flying surface from the
 *  front and the side. */
export const WING_TILT = 22;

/** The bones no wing vertex is near (steps.ts and wear.ts use the same list). */
export const TRUNK = [
  'spine_0',
  'spine_1',
  'spine_2',
  'neck_0',
  'neck_1',
  'head',
  'tail_0',
  'tail_1',
] as const;

/** Design values (README.md, "Wings"): an invented animal, nothing here is sourced. Degrees
 *  about the body's long axis from the raised rest; + lifts the wing toward the midline. */
export const FLAP = {
  /** Beats per second. A display beat on the ground, slow enough to read as heavy. Flight is
   *  out of reach either way (README.md, "Wings"). */
  hz: 0.9,
  /** Shoulder, wrist, finger: the top and the bottom of the stroke. The shoulder's is the same
   *  arc in space as before the wings were lowered by WING_TILT (it was 8 … −30 from the raised
   *  rest): the membrane was fitted to it. */
  stroke: [
    [30, -8],
    [5, -16],
    [4, -10],
  ],
  /** The joint limits QA `deform` poses the skin at: the stroke and 2° to spare. */
  limits: [
    [-10, 32],
    [-18, 7],
    [-12, 6],
  ],
  /** Share of the beat the downstroke takes: quicker down than up. */
  down: 0.42,
  /** Each joint trails the one before it by this share of the beat: the tip follows. */
  lag: 0.07,
  /** ± degrees with the breath in `idle`, and twice a stride in the walk. */
  idle: [1.2, 1.6, 2],
  carry: [1.5, 2.2, 3],
} as const;

export interface Wing {
  readonly side: 1 | -1;
  /** The centre the build step scales this wing about (asset frame, fitted rest). */
  readonly root: Vec3;
  /** Shoulder, wrist, mid finger, tip: in the scaled wing. */
  readonly joints: readonly [Vec3, Vec3, Vec3, Vec3];
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const ramp = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const toSegment = (p: Vec3, a: Vec3, b: Vec3): number => {
  const ab = sub(b, a);
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / (len(ab) ** 2 || 1),
    ),
  );
  return len(sub(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]));
};

/** How much of a wing a point is, 0..1 (steps.ts scales by the same rule), and its distance
 *  off the trunk's bones. */
export function wingMask(
  trunk: readonly Bone[],
  h: number,
): (p: Vec3) => { m: number; off: number } {
  return (p) => {
    const off = trunk.reduce((d, b) => Math.min(d, toSegment(p, b.head, b.tail)), Infinity);
    return { m: ramp(0.3 * h, 0.45 * h, off) * ramp(0.72 * h, 0.88 * h, p[2]), off };
  };
}

const found = new WeakMap<Float32Array, readonly Wing[]>();

/** Both wings on the fit (left first). Memoised per mesh. */
export function findWings(fit: ExtraFit): readonly Wing[] {
  const seen = found.get(fit.mesh.positions);
  if (seen) return seen;
  const h = fit.height;
  const bone = (name: string): Bone => {
    const b = fit.fitted.find((x) => x.name === `${fit.prefix}${name}`);
    if (!b) throw new Error(`dragon_hybrid wings: the fitted skeleton has no bone '${name}'`);
    return b;
  };
  const mask = wingMask(TRUNK.map(bone), h);
  const P = fit.mesh.positions;
  const wings = ([1, -1] as const).map((side): Wing => {
    const pts: Vec3[] = [];
    const core: Vec3[] = [];
    for (let i = 0; i < P.length; i += 3) {
      const p: Vec3 = [P[i] ?? 0, P[i + 1] ?? 0, P[i + 2] ?? 0];
      const m = p[1] * side > 0 ? mask(p).m : 0;
      if (m > 0.5) pts.push(p);
      if (m > 0.02 && m < 0.6) core.push(p);
    }
    if (pts.length === 0 || core.length === 0)
      throw new Error(`dragon_hybrid wings: no ${side > 0 ? 'left' : 'right'} wing on the mesh`);
    const mean = (k: 0 | 1 | 2): number => core.reduce((s, p) => s + p[k], 0) / core.length;
    const root: Vec3 = [mean(0), mean(1), mean(2)];
    const tip = pts.reduce((best, p) => (len(sub(p, root)) > len(sub(best, root)) ? p : best));
    const line = tracePath(fit.mesh, tip, bone('spine_2').head, { cell: h / 64 });
    // The shoulder: the first point of the line the wing's rule no longer claims (it is not
    // scaled, so the wing grows from it).
    const at = line.findIndex((p) => mask(p).off <= 0.3 * h);
    const arm = line.slice(0, at < 0 ? line.length : at + 1);
    const shoulder = arm[arm.length - 1] ?? root;
    const chord = sub(tip, shoulder);
    const off = (p: Vec3): number =>
      toSegment(p, shoulder, [
        shoulder[0] + chord[0],
        shoulder[1] + chord[1],
        shoulder[2] + chord[2],
      ]);
    const corner = arm.reduce((best, p, i) => (off(p) > off(arm[best] ?? p) ? i : best), 0);
    const wrist = arm[corner] ?? shoulder;
    const finger = arm[Math.floor(corner / 2)] ?? wrist;
    // As the build step moves the mesh (steps.ts): scaled about the root, then turned about the
    // body's long axis through it, both by how much of a wing the point is.
    const scaled = (p: Vec3): Vec3 => {
      const m = mask(p).m;
      const k = 1 + (WING_SCALE - 1) * m;
      const turn = (-side * WING_TILT * m * Math.PI) / 180;
      const [y, z] = [(p[1] - root[1]) * k, (p[2] - root[2]) * k];
      return [
        root[0] + (p[0] - root[0]) * k,
        root[1] + y * Math.cos(turn) - z * Math.sin(turn),
        root[2] + y * Math.sin(turn) + z * Math.cos(turn),
      ];
    };
    return { side, root, joints: [scaled(shoulder), scaled(wrist), scaled(finger), scaled(tip)] };
  });
  found.set(fit.mesh.positions, wings);
  return wings;
}

const SOURCE =
  'design value (README.md, "Wings"): an invented animal; a display beat from a raised V, the range the membrane takes without leaving the back (QA deform)';

/** The two wing chains for `modelChain({ extra })`. */
export function wingChains(fit: ExtraFit): ExtraChain[] {
  return findWings(fit).map((w): ExtraChain => {
    const axis: Vec3 = [w.side, 0, 0];
    return {
      name: w.side > 0 ? 'wing_l' : 'wing_r',
      parent: 'spine_2',
      joints: w.joints,
      limits: FLAP.limits.map(([min, max]): JointLimit => ({ axis, min, max })),
      source: SOURCE,
      motion: {
        clip: 'flap',
        hz: FLAP.hz,
        stroke: FLAP.stroke,
        down: FLAP.down,
        lag: FLAP.lag,
        idle: FLAP.idle,
        carry: FLAP.carry,
        source: SOURCE,
      },
    };
  });
}
