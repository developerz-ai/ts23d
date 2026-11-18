// The white shark's trunk: one loft from snout to precaudal pit carrying the gill slits, the caudal
// keels, the mouth pocket and the countershading with its ragged, sharp boundary; plus eyes, nostrils
// and the small median and pelvic fins, which ride the spine.

import type { BodyPlan, Mesh, Rng, Vec3 } from '@developerz.ai/ts23d';
import {
  add,
  curve3,
  even,
  fbm,
  gauss,
  loft,
  mixRgb,
  noise,
  norm,
  plate,
  scale,
  smooth,
  stations,
  sub,
  TAU,
} from '../_lib/body-plan-kit.ts';
import {
  angleOfShare,
  axisZ,
  COLOUR,
  GILLS,
  gillField,
  L,
  MOUTH,
  plainPoint,
  pocketMask,
  shadeLine,
  T_CAUDAL,
  T_EYE,
  tOf,
  topZ,
} from './anatomy.ts';
import { SKIN } from './material.ts';
import { mouthLine, nostril, pores } from './skin-detail.ts';

type Lod = 0 | 1 | 2;

/** Columns either side of the colour line are bent onto it, so its edge follows the mesh. */
const LINE_GAP = 0.012;
const lineColumn = (sides: number): number => Math.round(0.62 * (sides / 2));

/** Column position in half a section: 0 top .. sides/2 bottom, with the mirrored side's sign. */
function columnOf(a: number, sides: number): { k: number; side: 1 | -1 } {
  const half = a <= Math.PI + 1e-9;
  return { k: ((half ? a : TAU - a) / Math.PI) * (sides / 2), side: half ? 1 : -1 };
}

/** The true section angle of a loft column at ring t. */
function warpAngle(t: number, a: number, sides: number): number {
  if (sides % 2 === 1) return a;
  const { k, side } = columnOf(a, sides);
  const J = lineColumn(sides);
  const at = angleOfShare(t, shadeLine(t, side));
  const rest = sides / 2 - J - 1;
  const w =
    k <= J
      ? (k / J) * (at - LINE_GAP)
      : at + LINE_GAP + ((k - J - 1) / rest) * (Math.PI - at - LINE_GAP);
  return side > 0 ? w : TAU - w;
}

/** The finished trunk surface: grooves, keels and pocket applied to the plain section. */
function trunkPoint(t: number, raw: number, lod: Lod): Vec3 {
  const a = warpAngle(t, raw, SIDES[lod]);
  const p = plainPoint(t, a);
  const c = axisZ(t);
  let [y, z] = [p[1], p[2] - c];
  const r = Math.hypot(y, z) || 1;
  let push = 0;
  if (lod < 2) {
    const g = gillField(t, a);
    push += -0.024 * g.slit + 0.009 * g.lip;
    push -= 0.012 * eyeDent(p);
  }
  y += (y / r) * push;
  z += (z / r) * push;
  // The caudal keel: a low horizontal blade along each side of the peduncle.
  const keel = smooth(0.74, 0.8, t) * (1 - smooth(0.86, 0.885, t));
  y += Math.sign(y) * 0.042 * keel * gauss(z, 0.022);
  const pocket = z < 0 ? MOUTH.pocket * pocketMask(p[0], y) : 0;
  return [p[0], y, c + z + pocket];
}

export const eyeCentre = (side: 1 | -1): Vec3 => {
  const p = plainPoint(T_EYE, 1.2);
  return [p[0], p[1] * side, p[2]];
};

function eyeDent(p: Vec3): number {
  const e = eyeCentre(p[1] >= 0 ? 1 : -1);
  return gauss(Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2]), 0.05);
}

/** Skin colour: grey back with a bronze cast, sharp ragged line, white belly, dark slits. */
function trunkColour(p: Vec3, t: number, raw: number, sides: number): Vec3 {
  const a = warpAngle(t, raw, sides);
  const c = axisZ(t);
  const h = (p[2] - c) / Math.max(0.02, topZ(t) - c);
  const { k, side } = columnOf(raw, sides);
  const white = sides % 2 === 1 ? 1 - smooth(-0.3, -0.1, h) : k > lineColumn(sides) + 0.5 ? 1 : 0;
  const seed = side > 0 ? 9 : 19;
  const mottle = fbm(t * 90, a * 9, seed);
  let back = mixRgb(COLOUR.back, COLOUR.backDark, smooth(-0.1, 0.95, h) * 0.8);
  back = mixRgb(back, COLOUR.bronze, smooth(0.42, 0.7, mottle) * 0.3);
  // Skin break-up, design: broad cloudy patches and a fine freckle, up close only.
  if (sides > 20) {
    const cloud = 0.86 + 0.28 * fbm(t * 24, a * 2.6, seed + 3);
    const freckle = noise(t * 310, a * 34, seed + 5) > 0.74 ? 0.86 : 1;
    back = scale(back, cloud * freckle);
  }
  let out = mixRgb(back, COLOUR.belly, white);
  if (sides > 20 && white > 0.5 && noise(t * 260, a * 30, seed + 7) > 0.86)
    out = mixRgb(out, COLOUR.back, 0.16);
  const g = gillField(t, a);
  out = mixRgb(out, COLOUR.slit, smooth(0.25, 0.8, g.slit));
  const m = pocketMask(p[0], p[1]);
  if (p[2] < c && m > 0.02) out = mixRgb(out, COLOUR.mouth, smooth(0.05, 0.6, m));
  return out;
}

const RINGS: readonly [number, number, number] = [120, 44, 0];
const SIDES: readonly [number, number, number] = [88, 30, 7];

function trunkStations(plan: BodyPlan, lod: Lod): number[] {
  const end = T_CAUDAL + 0.042;
  const joints = (plan.chains[0]?.links ?? []).map((l) => tOf(l.bone.head[0]));
  if (lod === 2) return stations([0.004, 0.022, ...joints.filter((t) => t > 0.03), end]);
  const near = (c: number, half: number, n: number): number[] => even(c - half, c + half, n);
  const gills = GILLS.flatMap((g) => (lod === 0 ? near(g, 0.022, 20) : near(g, 0.012, 4)));
  const mouth = even(MOUTH.tFront - 0.012, 0.13, lod === 0 ? 26 : 8);
  const snout = even(0.0015, 0.05, lod === 0 ? 16 : 6);
  const eye = lod === 0 ? near(T_EYE, 0.018, 8) : [];
  return stations(
    [...even(0.05, end, RINGS[lod]), ...gills, ...mouth, ...snout, ...eye, ...joints, end],
    lod === 0 ? 4e-4 : 1.5e-3,
  );
}

export function trunkMesh(plan: BodyPlan, lod: Lod): Mesh {
  return loft({
    us: trunkStations(plan, lod),
    sides: SIDES[lod],
    strip: SKIN,
    metres: [L, 2.6],
    stripHeight: 3,
    point: (t, a) => trunkPoint(t, a, lod),
    color: (p, _n, t, a) => trunkColour(p, t, a, SIDES[lod]),
  });
}

/** Eye: a glossy black ball seated in its dent, the pupil-less look of a white shark. */
export function eyeMesh(side: 1 | -1, lod: Lod): Mesh {
  const c = eyeCentre(side);
  const out = norm(sub(c, [c[0], 0, axisZ(T_EYE)]));
  const centre = add(c, scale(out, -0.024));
  const R = 0.031;
  const [rings, sides] = lod === 0 ? [8, 16] : lod === 1 ? [4, 8] : [2, 4];
  return loft({
    us: even(0.06, 0.94, rings),
    sides,
    strip: 'plastic',
    point: (u, a) => {
      const th = u * Math.PI;
      return [
        centre[0] + R * Math.cos(th),
        centre[1] + R * Math.sin(th) * Math.cos(a),
        centre[2] + R * Math.sin(th) * Math.sin(a),
      ];
    },
    color: () => COLOUR.eye,
  });
}

interface SmallFin {
  readonly t: number;
  readonly base: number;
  readonly out: Vec3;
  readonly from: Vec3;
}

function smallFin(f: SmallFin, lod: Lod, pale: boolean): Mesh {
  const front = f.from;
  const rear: Vec3 = [front[0] - f.base, front[1], front[2]];
  const tip = add(add(front, f.out), [-f.base * 0.75, 0, 0]);
  const lead = curve3([front, add(add(front, scale(f.out, 0.6)), [-f.base * 0.2, 0, 0]), tip]);
  const trail = curve3([rear, add(add(rear, scale(f.out, 0.4)), [f.base * 0.12, 0, 0]), tip]);
  return plate({
    lead,
    trail,
    thick: (u) => 0.012 * (1 - u) + 0.002,
    us: even(0, 0.985, lod === 0 ? 6 : 2),
    sides: lod === 0 ? 10 : 4,
    strip: SKIN,
    color: (_p, n) =>
      mixRgb(pale ? COLOUR.belly : COLOUR.back, COLOUR.backDark, n[2] > 0 ? 0.5 : 0),
  });
}

/** Second dorsal, anal and pelvic fins: small, carried by the spine. */
export function smallFins(lod: Lod): Mesh[] {
  const at = (t: number, a: number, sink: number): Vec3 => {
    const p = plainPoint(t, a);
    return [p[0], p[1], p[2] + (a < 1 ? -sink : sink)];
  };
  const pelvic = (side: 1 | -1): Mesh => {
    const p = at(0.615, TAU * 0.36, 0.05);
    return smallFin(
      {
        t: 0.615,
        base: 0.2,
        from: [p[0], p[1] * side * 0.8, p[2]],
        out: [-0.02, 0.17 * side, -0.15],
      },
      lod,
      true,
    );
  };
  return [
    smallFin({ t: 0.79, base: 0.09, from: at(0.79, 0, 0.03), out: [0, 0, 0.1] }, lod, false),
    smallFin(
      { t: 0.805, base: 0.08, from: at(0.805, Math.PI, 0.03), out: [0, 0, -0.09] },
      lod,
      true,
    ),
    pelvic(1),
    pelvic(-1),
  ];
}

/** Everything on the head that stays rigid with it. */
export const faceDetail = (lod: Lod, rng: Rng): Mesh[] => [
  ...mouthLine(lod),
  ...(lod === 0 ? [...nostril(1), ...nostril(-1), ...pores(rng)] : []),
];
