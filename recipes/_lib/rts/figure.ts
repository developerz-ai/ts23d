// The Saltmarch body: one chunky, readable RTS figure (≈ 5.7 heads, big hands, broad shoulders)
// shared by the worker and the soldier, so the roster has one silhouette family. Built from
// pebble masses and tapered tubes, facing +X, feet on z = 0, on real materials (canvas suit,
// leather boots and gloves, rubber soles). Parts go into a `Kit` so the caller weathers them.
// LOD2 keeps the outline in ~250 triangles: boxes and 4-sided tubes, no caps nobody sees.

import {
  applyAffine,
  box,
  dmath,
  frame,
  type Lod,
  loft,
  type Mesh,
  merge,
  place,
  ringXY,
  type StripId,
  sweep,
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
  readonly right: 'hang' | 'hold' | 'shoulder' | 'port';
  /** Radius of the handle the right fist wraps (`hold`, `shoulder`, `port`). */
  readonly handleR?: number;
  /**
   * `port`: a long tool or weapon carried diagonally across the body. The right fist closes round
   * `axis` at `grip` (low, by the right hip); the left forearm reaches across to `support` (up by
   * the left shoulder) and its glove rests there, under the shaft.
   */
  readonly port?: { readonly grip: Vec3; readonly axis: Vec3; readonly support: Vec3 };
  /**
   * Caked mud up to this height (m): a crust over each boot's lower half and a shell 4 mm over
   * each shin with a ragged top, on a pale grey strip (leather and canvas strips cannot be tinted
   * lighter than themselves). LOD0/1.
   */
  readonly mud?: number;
}

export interface FigurePoints {
  /** Centre of the right fist's grip (the handle runs along `gripAxis` through it). */
  readonly grip: Vec3;
  /** Unit handle axis through the grip: +Z for `hang`/`hold`, up and back for `shoulder`. */
  readonly gripAxis: Vec3;
  /** Right elbow and wrist of the chosen pose, for cuffs and sleeves over the forearm. */
  readonly elbowR: Vec3;
  readonly wristR: Vec3;
  /** Left elbow and wrist (hanging, or reaching across in `port`). */
  readonly elbowL: Vec3;
  readonly wristL: Vec3;
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
      pebble(lod, [0.27, 0.15, 0.14], [0.03, y, 0], o.boots),
      // Thick sole and a rounded toe cap: the boot reads chunky from above.
      ...(lod === 0
        ? [
            box({ size: [0.28, 0.16, 0.035], at: [0.03, y, 0], color: RUBBER }),
            ellipsoid(lod, [0.13, y, 0.06], [0.06, 0.07, 0.06], o.boots),
            tube(lod, [0, y, 0.12], [0, y, 0.2], 0.085, 0.088, o.boots),
          ]
        : []),
    ]),
    // LOD0: trousers bloused over the boot top and bunched behind the knee (rings the light
    // catches, and heights for mud to climb); LOD1/2 a plain taper.
    shin:
      lod > 0
        ? tube(lod, [0, y, 0.1], [0, y, 0.52], 0.078, 0.095, o.suit)
        : sweep({
            section: { radius: 1, segments: SEG(lod, 16, 8, 4) },
            path: [
              [0, y, 0.1],
              [0, y, 0.17],
              [0, y, 0.22],
              [0, y, 0.33],
              [0, y, 0.44],
              [0, y, 0.48],
              [0, y, 0.52],
            ],
            scale: [0.08, 0.094, 0.084, 0.086, 0.094, 0.1, 0.096],
            color: o.suit,
            caps: true,
          }),
    thigh:
      lod > 0
        ? tube(lod, [0, y, 0.48], [0, y - 0.01, 0.9], 0.098, 0.124, o.suit)
        : sweep({
            section: { radius: 1, segments: SEG(lod, 16, 8, 4) },
            path: [
              [0, y, 0.48],
              [0, y, 0.55],
              [0.004, y - 0.005, 0.7],
              [0, y - 0.01, 0.9],
            ],
            scale: [0.1, 0.106, 0.114, 0.124],
            color: o.suit,
            caps: true,
          }),
  };
}

/** Dried brine mud (on the grey concrete strip) and the wet dark mud at the soles. */
const CAKED_MUD: Vec3 = [0.5, 0.44, 0.34];
const WET_MUD: Vec3 = [0.2, 0.16, 0.11];

/**
 * The left leg's mud: a crust over the boot's lower half (dark and wet at the sole) and a shell
 * over the shin's bloused cuff up to `top`, its upper ring ragged.
 */
function mudLeg(lod: Lod, top: number): Mesh {
  const y = HIP_Y;
  const crust = box({
    size: [0.29, 0.17, 0.09],
    at: [0.03, y, -0.005],
    color: WET_MUD,
    strip: 'concrete',
  });
  // Shin shell: the shin's own rings (bloused at 0.17) 4 mm out, to `top`.
  // LOD1 skips the ring under the cuff (the shin there is a plain taper).
  const zs = lod === 0 ? [0.1, 0.17, 0.22, top] : [0.1, top];
  const rs = (lod === 0 ? [0.08, 0.094, 0.084, 0.085] : [0.08, 0.086]).map((r) => r + 0.004);
  const shell = sweep({
    section: { radius: 1, segments: SEG(lod, 16, 8, 4) },
    path: zs.map((z): Vec3 => [0, y, z]),
    scale: rs,
    color: CAKED_MUD,
    strip: 'concrete',
    caps: false,
  });
  // Ragged upper edge and a darker foot, per vertex.
  const positions = new Float32Array(shell.positions);
  const colors = new Float32Array(shell.colors);
  for (let i = 0; i < positions.length; i += 3) {
    const z = positions[i + 2] ?? 0;
    const a = dmath.atan2((positions[i + 1] ?? 0) - y, positions[i] ?? 0);
    if (z > top - 1e-4) positions[i + 2] = z - 0.05 * (0.5 + 0.5 * dmath.sin(a * 5 + 1.3));
    const t = Math.min(1, Math.max(0, (z - 0.1) / (top - 0.1)));
    for (let c = 0; c < 3; c++)
      colors[i + c] = (WET_MUD[c] ?? 0) * (1 - t) * 0.5 + (CAKED_MUD[c] ?? 0) * (0.5 + 0.5 * t);
  }
  return merge([crust, { ...shell, positions, colors }]);
}

/** A gloved mitten hanging at the wrist (the free hand). */
const mitten = (lod: Lod, at: Vec3, color: Vec3): Mesh => {
  const k = HAND_K;
  return lod === 2
    ? pebble(lod, [0.09 * k, 0.07 * k, 0.12 * k], [at[0], at[1], at[2] - 0.1 * k], color)
    : ellipsoid(lod, [at[0], at[1], at[2] - 0.05 * k], [0.05 * k, 0.042 * k, 0.075 * k], color);
};

/** A glove cupped under a shaft: the mitten from the wrist reaching to `palm`. */
const glove = (lod: Lod, wrist: Vec3, palm: Vec3, color: Vec3): Mesh => {
  const k = HAND_K;
  const c: Vec3 = [(wrist[0] + palm[0]) / 2, (wrist[1] + palm[1]) / 2, (wrist[2] + palm[2]) / 2];
  return lod === 2
    ? pebble(lod, [0.09 * k, 0.09 * k, 0.09 * k], [c[0], c[1], c[2] - 0.045 * k], color)
    : ellipsoid(lod, c, [0.055 * k, 0.05 * k, 0.05 * k], color);
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
  if (o.mud && lod < 2) {
    const m = mudLeg(lod, o.mud);
    kit.add('mud_l', m);
    kit.add('mud_r', mirrorY(m));
  }
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
  if (o.right !== 'shoulder' && o.right !== 'port') body.part('arm_r_upper', mirrorY(upper));
  const left = leftArm(o);
  if (o.right === 'port' && o.port) {
    // Left arm across the body: elbow forward and in, the glove under the shaft at `support`.
    const { elbowL, wristL } = left;
    const s = o.port.support;
    body.part('arm_l_upper', tube(lod, sh, elbowL, 0.072, 0.062, o.suit));
    body.part(
      'arm_l_fore',
      withCuff(lod, tube(lod, elbowL, wristL, 0.056, 0.048, o.suit), elbowL, wristL, o.hands),
    );
    body.part('hand_l', glove(lod, wristL, s, o.hands));
  } else {
    body.part('arm_l_upper', upper);
    const { wristL } = left;
    body.part(
      'arm_l_fore',
      withCuff(lod, tube(lod, ELBOW, wristL, 0.056, 0.046, o.suit), ELBOW, wristL, o.hands),
    );
    body.part('hand_l', mitten(lod, wristL, o.hands));
  }
  const pt = (grip: Vec3, axis: Vec3, elbow: Vec3, wrist: Vec3): FigurePoints =>
    points(grip, axis, elbow, wrist, left.elbowL, left.wristL);
  const elbowR: Vec3 = [ELBOW[0], -ELBOW[1], ELBOW[2]];
  if (o.right === 'hang') {
    const wristR: Vec3 = [0.02, -0.32, 0.86];
    body.part(
      'arm_r_fore',
      withCuff(lod, tube(lod, elbowR, wristR, 0.056, 0.046, o.suit), elbowR, wristR, o.hands),
    );
    body.part('hand_r', mitten(lod, wristR, o.hands));
    return pt(wristR, UP, elbowR, wristR);
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
    const len = dmath.hypot(d[0], d[2]);
    const axis: Vec3 = [d[0] / len, 0, d[2] / len];
    // The upper arm swings forward to the raised elbow (replaces the hanging mirror).
    body.part('arm_r_upper', tube(lod, [sh[0], -sh[1], sh[2]], elbow, 0.072, 0.062, o.suit));
    body.part(
      'arm_r_fore',
      withCuff(lod, tube(lod, elbow, wristR, 0.056, 0.048, o.suit), elbow, wristR, o.hands),
    );
    const turned = place(fist(lod, handleR, o.hands), { yaw: Math.PI / 2 });
    body.part('hand_r', place(turned, { at: grip, pitch: dmath.atan2(axis[0], axis[2]) }));
    return pt(grip, axis, elbow, wristR);
  }
  if (o.right === 'port' && o.port) {
    // Port: elbow back by the hip, forearm forward to the low grip, the fist turned onto `axis`
    // (knuckles forward) so it closes round the slanted shaft.
    const { grip, axis } = o.port;
    const elbow: Vec3 = [-0.02, -0.3, 1.1];
    const wristR: Vec3 = [grip[0] - 0.06, grip[1] - 0.01, grip[2] + 0.01];
    body.part('arm_r_upper', tube(lod, [sh[0], -sh[1], sh[2]], elbow, 0.072, 0.062, o.suit));
    body.part(
      'arm_r_fore',
      withCuff(lod, tube(lod, elbow, wristR, 0.056, 0.048, o.suit), elbow, wristR, o.hands),
    );
    const fx: Vec3 = [-1, 0, 0];
    const fy: Vec3 = [
      axis[1] * fx[2] - axis[2] * fx[1],
      axis[2] * fx[0] - axis[0] * fx[2],
      axis[0] * fx[1] - axis[1] * fx[0],
    ];
    body.part(
      'hand_r',
      applyAffine(fist(lod, o.handleR ?? 0.02, o.hands), frame(fx, fy, axis, grip)),
    );
    return pt(grip, axis, elbow, wristR);
  }
  // Holding: forearm forward and a little inward, fist round an upright handle.
  const wristR: Vec3 = [0.25, -0.27, 1.06];
  const grip: Vec3 = [0.3, -0.265, 1.06];
  body.part(
    'arm_r_fore',
    withCuff(lod, tube(lod, elbowR, wristR, 0.056, 0.048, o.suit), elbowR, wristR, o.hands),
  );
  body.part('hand_r', place(fist(lod, o.handleR ?? 0.02, o.hands), { at: grip, yaw: Math.PI / 2 }));
  return pt(grip, UP, elbowR, wristR);
}

/** The left arm's joints: hanging, or reaching across to a `port` support. */
function leftArm(o: FigureOptions): { elbowL: Vec3; wristL: Vec3 } {
  if (o.right === 'port' && o.port) {
    const s = o.port.support;
    return { elbowL: [0.12, 0.28, 1.12], wristL: [s[0] - 0.02, s[1] + 0.06, s[2] - 0.07] };
  }
  return { elbowL: ELBOW, wristL: [0.02, 0.32, 0.86] };
}

const points = (
  grip: Vec3,
  gripAxis: Vec3,
  elbowR: Vec3,
  wristR: Vec3,
  elbowL: Vec3,
  wristL: Vec3,
): FigurePoints => ({
  grip,
  gripAxis,
  elbowR,
  wristR,
  elbowL,
  wristL,
  shoulder: SHOULDER,
  back: [-0.16, 0, 1.28],
  head: HEAD,
  headR: HEAD_R,
});

/** Merge helper for gear lists that may be empty at a LOD. */
export const gear = (ms: readonly Mesh[]): Mesh | null => (ms.length ? merge(ms) : null);
