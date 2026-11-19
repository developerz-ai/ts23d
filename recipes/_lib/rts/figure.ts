// The Saltmarch body: one chunky, readable RTS figure (≈ 5.7 heads, big hands, broad shoulders)
// shared by the worker and the soldier, so the roster has one silhouette family. Built from
// pebble masses and tapered tubes, facing +X, feet on z = 0, on real materials (canvas suit,
// leather boots and gloves, rubber soles). Parts go into a `Kit` so the caller weathers them.
// LOD2 keeps the outline in ~250 triangles: boxes and 4-sided tubes, no caps nobody sees.

import {
  box,
  type Lod,
  loft,
  type Mesh,
  merge,
  place,
  ringXY,
  type StripId,
  type Vec3,
} from '@developerz.ai/ts23d';
import { type Kit, type Rule, restrip, role } from './finish.ts';
import { ellipsoid, fist, mirrorY, pebble, RUBBER, SEG, SKIN, tube } from './style.ts';

export interface FigureOptions {
  /** Undersuit (legs, arms). */
  readonly suit: Vec3;
  /** Torso shell, and its material (ceramic `plastic` armour, `canvas` padding…). */
  readonly torso: Vec3;
  readonly torsoStrip: StripId;
  readonly boots: Vec3;
  /** Gloves. */
  readonly hands: Vec3;
  /**
   * Right arm: hanging; forward holding a handle upright (`hold`); or fist at the chest with the
   * handle resting back over the right shoulder (`shoulder`, a tool carried on the march). Both
   * holding poses give a grip joint target: `grip` + `gripAxis`.
   */
  readonly right: 'hang' | 'hold' | 'shoulder';
  /** Radius of the handle the right fist wraps (`hold`, `shoulder`). */
  readonly handleR?: number;
}

export interface FigurePoints {
  /** Centre of the right fist's grip (the handle runs along `gripAxis` through it). */
  readonly grip: Vec3;
  /** Unit handle axis through the grip: +Z for `hang`/`hold`, up and back for `shoulder`. */
  readonly gripAxis: Vec3;
  /** Right elbow and wrist of the chosen pose, for cuffs and sleeves over the forearm. */
  readonly elbowR: Vec3;
  readonly wristR: Vec3;
  /** Shoulder tops, for pauldrons. */
  readonly shoulder: Vec3;
  /** Centre of the back at shoulder-blade height, for packs. */
  readonly back: Vec3;
  /** Head centre and radii. */
  readonly head: Vec3;
  readonly headR: Vec3;
}

const HIP_Y = 0.13;
const SHOULDER: Vec3 = [-0.01, 0.27, 1.4];
const ELBOW: Vec3 = [-0.02, 0.31, 1.12];
export const HEAD: Vec3 = [0.01, 0, 1.69];
/** 10% over a real head (0.115 × 0.105 × 0.13 m): the face and cap read at RTS distance. */
const HEAD_K = 1.1;
export const HEAD_R: Vec3 = [0.115 * HEAD_K, 0.105 * HEAD_K, 0.13 * HEAD_K];
/** Gloves 15% over life size, like the fist (style.ts). */
const HAND_K = 1.15;
const UP: Vec3 = [0, 0, 1];

/** Torso loft: waist → chest → shoulders, chunky and slightly forward-leaning. */
function torsoMesh(lod: Lod, color: Vec3): Mesh {
  const s = SEG(lod, 24, 12, 6);
  const rings =
    lod === 2
      ? [
          ringXY([0, 0, 0.94], 0.13, 0.17, s),
          ringXY([0.01, 0, 1.3], 0.17, 0.25, s),
          ringXY([0, 0, 1.5], 0.1, 0.15, s),
        ]
      : [
          ringXY([0, 0, 0.94], 0.13, 0.17, s),
          ringXY([0.005, 0, 1.08], 0.145, 0.19, s),
          ringXY([0.015, 0, 1.24], 0.17, 0.235, s),
          ringXY([0.015, 0, 1.36], 0.17, 0.25, s),
          ringXY([0.005, 0, 1.45], 0.14, 0.22, s),
          ringXY([0, 0, 1.51], 0.09, 0.14, s),
        ];
  return loft({ rings, color, capStart: true, capEnd: true });
}

/** One leg (left, +Y); the right is its mirror. */
function leg(lod: Lod, o: FigureOptions): { boot: Mesh; shin: Mesh; thigh: Mesh } {
  const y = HIP_Y;
  return {
    boot: merge([
      pebble(lod, [0.3, 0.15, 0.14], [0.035, y, 0], o.boots),
      // Thick sole and a rounded toe cap: the boot reads chunky from above.
      ...(lod === 0
        ? [
            box({ size: [0.31, 0.16, 0.035], at: [0.035, y, 0], color: RUBBER }),
            ellipsoid(lod, [0.15, y, 0.06], [0.06, 0.07, 0.06], o.boots),
            tube(lod, [0, y, 0.12], [0, y, 0.2], 0.085, 0.088, o.boots),
          ]
        : []),
    ]),
    shin: tube(lod, [0, y, 0.1], [0, y, 0.52], 0.078, 0.095, o.suit),
    thigh: tube(lod, [0, y, 0.48], [0, y - 0.01, 0.9], 0.098, 0.124, o.suit),
  };
}

/** A gloved mitten hanging at the wrist (the free hand). */
const mitten = (lod: Lod, at: Vec3, color: Vec3): Mesh => {
  const k = HAND_K;
  return lod === 2
    ? pebble(lod, [0.09 * k, 0.07 * k, 0.12 * k], [at[0], at[1], at[2] - 0.1 * k], color)
    : ellipsoid(lod, [at[0], at[1], at[2] - 0.05 * k], [0.05 * k, 0.042 * k, 0.075 * k], color);
};

/** A flared glove cuff over the last 30% of a forearm (LOD0). */
function withCuff(lod: Lod, fore: Mesh, elbow: Vec3, wrist: Vec3, color: Vec3): Mesh {
  if (lod > 0) return fore;
  const at = (t: number): Vec3 => [
    elbow[0] + (wrist[0] - elbow[0]) * t,
    elbow[1] + (wrist[1] - elbow[1]) * t,
    elbow[2] + (wrist[2] - elbow[2]) * t,
  ];
  return merge([fore, tube(lod, at(0.7), at(1.02), 0.056, 0.062, color)]);
}

/** Body materials: canvas undersuit, leather boots and gloves, rubber soles, the torso's own. */
const rulesOf = (o: FigureOptions): Rule[] => [
  role(o.suit, 'canvas'),
  role(o.torso, o.torsoStrip),
  role(o.boots, 'leather'),
  role(o.hands, 'leather'),
  role(RUBBER, 'rubber'),
];

export function figure(kit: Kit, lod: Lod, o: FigureOptions): FigurePoints {
  const rules = rulesOf(o);
  const body = {
    part: (name: string, m: Mesh): void => kit.add(name, restrip(m, rules)),
  };
  const l = leg(lod, o);
  body.part('boot_l', l.boot);
  body.part('boot_r', mirrorY(l.boot));
  body.part('shin_l', l.shin);
  body.part('shin_r', mirrorY(l.shin));
  body.part('thigh_l', l.thigh);
  body.part('thigh_r', mirrorY(l.thigh));
  body.part('pelvis', pebble(lod, [0.25, 0.37, 0.2], [0, 0, 0.8], o.suit));
  body.part('torso', torsoMesh(lod, o.torso));
  body.part('neck', tube(lod, [0, 0, 1.47], [0.005, 0, 1.6], 0.056, 0.052, SKIN));
  // Head with the face's big planes at LOD0: a nose wedge and a squared jaw catch the key light.
  body.part(
    'head',
    lod === 0
      ? merge([
          ellipsoid(lod, HEAD, HEAD_R, SKIN),
          ellipsoid(
            lod,
            [HEAD[0] + 0.1 * HEAD_K, 0, HEAD[2] - 0.025 * HEAD_K],
            [0.025 * HEAD_K, 0.018 * HEAD_K, 0.03 * HEAD_K],
            SKIN,
          ),
          ellipsoid(
            lod,
            [HEAD[0] + 0.03 * HEAD_K, 0, HEAD[2] - 0.07 * HEAD_K],
            [0.075 * HEAD_K, 0.08 * HEAD_K, 0.045 * HEAD_K],
            SKIN,
          ),
        ])
      : ellipsoid(lod, HEAD, HEAD_R, SKIN),
  );

  // Arms: upper arms hang slightly out; the left forearm hangs, the right hangs or holds.
  // LOD2's 4-sided torso is narrower at the shoulder line: start the arm inside it.
  const sh: Vec3 = lod === 2 ? [SHOULDER[0], 0.225, SHOULDER[2]] : SHOULDER;
  const upper = tube(lod, sh, ELBOW, 0.072, 0.062, o.suit);
  body.part('arm_l_upper', upper);
  if (o.right !== 'shoulder') body.part('arm_r_upper', mirrorY(upper));
  const wristL: Vec3 = [0.02, 0.32, 0.86];
  body.part(
    'arm_l_fore',
    withCuff(lod, tube(lod, ELBOW, wristL, 0.056, 0.046, o.suit), ELBOW, wristL, o.hands),
  );
  body.part('hand_l', mitten(lod, wristL, o.hands));
  const elbowR: Vec3 = [ELBOW[0], -ELBOW[1], ELBOW[2]];
  if (o.right === 'hang') {
    const wristR: Vec3 = [0.02, -0.32, 0.86];
    body.part(
      'arm_r_fore',
      withCuff(lod, tube(lod, elbowR, wristR, 0.056, 0.046, o.suit), elbowR, wristR, o.hands),
    );
    body.part('hand_r', mitten(lod, wristR, o.hands));
    return points(wristR, UP, elbowR, wristR);
  }
  if (o.right === 'shoulder') {
    // Shouldered: elbow forward and down, fist in front of the right shoulder, the handle resting
    // on the shoulder top (shoulder + upper-arm radius + handle radius) and running up and back.
    const handleR = o.handleR ?? 0.02;
    const elbow: Vec3 = [0.1, -0.31, 1.17];
    const wristR: Vec3 = [0.17, -0.28, 1.33];
    const grip: Vec3 = [0.2, -0.27, 1.36];
    const rest: Vec3 = [SHOULDER[0], grip[1], SHOULDER[2] + 0.072 + handleR];
    const d: Vec3 = [rest[0] - grip[0], 0, rest[2] - grip[2]];
    const len = Math.hypot(d[0], d[2]);
    const axis: Vec3 = [d[0] / len, 0, d[2] / len];
    // The upper arm swings forward to the raised elbow (replaces the hanging mirror).
    body.part('arm_r_upper', tube(lod, [sh[0], -sh[1], sh[2]], elbow, 0.072, 0.062, o.suit));
    body.part(
      'arm_r_fore',
      withCuff(lod, tube(lod, elbow, wristR, 0.056, 0.048, o.suit), elbow, wristR, o.hands),
    );
    const turned = place(fist(lod, handleR, o.hands), { yaw: Math.PI / 2 });
    body.part('hand_r', place(turned, { at: grip, pitch: Math.atan2(axis[0], axis[2]) }));
    return points(grip, axis, elbow, wristR);
  }
  // Holding: forearm forward and a little inward, fist round an upright handle.
  const wristR: Vec3 = [0.25, -0.27, 1.06];
  const grip: Vec3 = [0.3, -0.265, 1.06];
  body.part(
    'arm_r_fore',
    withCuff(lod, tube(lod, elbowR, wristR, 0.056, 0.048, o.suit), elbowR, wristR, o.hands),
  );
  body.part('hand_r', place(fist(lod, o.handleR ?? 0.02, o.hands), { at: grip, yaw: Math.PI / 2 }));
  return points(grip, UP, elbowR, wristR);
}

const points = (grip: Vec3, gripAxis: Vec3, elbowR: Vec3, wristR: Vec3): FigurePoints => ({
  grip,
  gripAxis,
  elbowR,
  wristR,
  shoulder: SHOULDER,
  back: [-0.16, 0, 1.28],
  head: HEAD,
  headR: HEAD_R,
});

/** Merge helper for gear lists that may be empty at a LOD. */
export const gear = (ms: readonly Mesh[]): Mesh | null => (ms.length ? merge(ms) : null);
