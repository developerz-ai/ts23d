// The arm, held out along +X with the thumb up: a deltoid cap sawn off flat, the upper arm (biceps on top,
// triceps under) and the forearm (brachioradialis over the elbow, the flexor belly on the palm
// side, tapering to a flat wrist with the ulna's knob), as lofts of shaped rings. The elbow ring
// is shared by both parts (the olecranon points down, the epicondyles widen it), so the `elbow`
// joint is flush by construction. Returns where the wrist is, so the hand module builds to fit.
// Skin is painted per vertex: sun on the outer side, a paler inner side, a red dry elbow, mottle,
// grime toward the wrist.

import {
  type BuildContext,
  dmath,
  hex,
  loft,
  type Rng,
  type Vec3,
  valueNoise,
} from '@developerz.ai/ts23d';
import { onSkin } from '../_lib/face/skin-strip.ts';
import { blob, mix } from './shape.ts';

export const SKIN = hex('#c58c68');
const TAN = hex('#9c6240');
const PALE = hex('#d8a888');
const RED = hex('#b05a48');
const DIRT = hex('#5a4030');
/** The sawn face of the shoulder. */
const SECTION = hex('#5c2a26');

/** An ellipse in the plane x = const, CCW seen from +X (rings run along +X). */
export const ringYZ = (x: number, ry: number, rz: number, z: number, n: number): Vec3[] =>
  Array.from({ length: n }, (_, k): Vec3 => {
    const a = (k / n) * Math.PI * 2;
    return [x, ry * dmath.cos(a), z + rz * dmath.sin(a)];
  });

/** A muscle or bone landmark on a ring: where round the limb (degrees, 0 = +Y the palm side,
 *  90 = up the thumb side, 180 = the back, 270 = down), how far it swells, how wide. */
interface Bump {
  readonly deg: number;
  readonly amount: number;
  readonly width: number;
}

interface Section {
  /** 0 at the part's start, 1 at its end. */
  readonly t: number;
  readonly ry: number;
  readonly rz: number;
  readonly bumps?: readonly Bump[];
}

const section = (x: number, s: Section, z: number, n: number): Vec3[] =>
  Array.from({ length: n }, (_, k): Vec3 => {
    const a = (k / n) * Math.PI * 2;
    let w = 1;
    for (const b of s.bumps ?? []) {
      let d = Math.abs(a - (b.deg * Math.PI) / 180);
      d = Math.min(d, Math.PI * 2 - d) / b.width;
      w += b.amount * dmath.exp(-d * d);
    }
    return [x, s.ry * dmath.cos(a) * w, z + s.rz * dmath.sin(a) * w];
  });

/** Sections between the listed ones (Catmull–Rom on the radii would overshoot the taper: the
 *  listed sections are dense enough for a smoothstep blend). */
function between(a: Section, b: Section): Section {
  const bumps = [...(a.bumps ?? []), ...(b.bumps ?? [])].map((m) => ({
    ...m,
    amount: m.amount * 0.5,
  }));
  return { t: (a.t + b.t) / 2, ry: (a.ry + b.ry) / 2, rz: (a.rz + b.rz) / 2, bumps };
}

function refine(list: readonly Section[], lod: number): Section[] {
  // Far: the ends, and for the forearm the belly between them, so it keeps its swell and its
  // taper to the wrist (two rings alone made it a flat slab; the upper arm is near enough a tube).
  if (lod === 2) {
    const ends = [list[0] as Section, list[list.length - 1] as Section];
    return list === UPPER ? ends : [ends[0] as Section, list[2] as Section, ends[1] as Section];
  }
  if (lod === 1) return [...list];
  return list.flatMap((s, i) => {
    const next = list[i + 1];
    return next ? [s, between(s, next)] : [s];
  });
}

/** The elbow ring both parts end on: epicondyles widen it, the olecranon points down. */
const ELBOW: Omit<Section, 't'> = {
  ry: 0.042,
  rz: 0.04,
  // (The olecranon and the two epicondyles: the elbow reads as a joint, not as a tube's middle.)
  bumps: [
    { deg: 270, amount: 0.26, width: 0.4 },
    { deg: 0, amount: 0.1, width: 0.4 },
    { deg: 180, amount: 0.1, width: 0.4 },
  ],
};

const UPPER: readonly Section[] = [
  { t: 0, ry: 0.052, rz: 0.05 },
  // Deltoid insertion, then the biceps belly on top and the triceps under it.
  { t: 0.18, ry: 0.051, rz: 0.053, bumps: [{ deg: 90, amount: 0.05, width: 0.9 }] },
  {
    t: 0.42,
    ry: 0.047,
    rz: 0.052,
    bumps: [
      { deg: 90, amount: 0.09, width: 0.7 },
      { deg: 270, amount: 0.06, width: 0.8 },
    ],
  },
  { t: 0.66, ry: 0.044, rz: 0.047, bumps: [{ deg: 90, amount: 0.05, width: 0.7 }] },
  // The arm narrows above the elbow (the triceps tendon), then the joint widens again.
  { t: 0.86, ry: 0.037, rz: 0.037 },
  { t: 1, ...ELBOW },
];

const forearm = (wy: number, wz: number): readonly Section[] => [
  { t: 0, ...ELBOW },
  // Brachioradialis over the top of the elbow, the flexor mass on the palm side.
  {
    t: 0.14,
    ry: 0.045,
    rz: 0.046,
    bumps: [
      { deg: 80, amount: 0.14, width: 0.6 },
      { deg: 330, amount: 0.1, width: 0.7 },
    ],
  },
  {
    t: 0.32,
    ry: 0.043,
    rz: 0.044,
    bumps: [
      { deg: 75, amount: 0.1, width: 0.6 },
      { deg: 330, amount: 0.09, width: 0.7 },
    ],
  },
  { t: 0.56, ry: 0.034, rz: 0.036 },
  { t: 0.78, ry: 0.0255, rz: 0.032 },
  // The ulna's knob (styloid) on the back, just short of the wrist.
  { t: 0.93, ry: 0.0225, rz: 0.032, bumps: [{ deg: 215, amount: 0.2, width: 0.3 }] },
  { t: 1, ry: wy, rz: wz },
];

/** Skin colour at a point of the arm or hand; `out` is the outward direction there. */
export type Tone = (p: Vec3, out: Vec3) => Vec3;

/** The painter: outdoor skin, so the story is sun, work and dirt rather than damage. */
export function skinTone(rng: Rng, marks: { readonly red: readonly Vec3[]; grime: Vec3 }): Tone {
  const mottle = valueNoise(rng.fork('mottle'), { scale: 0.035, octaves: 3 });
  const fine = valueNoise(rng.fork('fine'), { scale: 0.009, octaves: 2 });
  return (p, out) => {
    // Sun on the back and top of the arm, a paler palm side and underside.
    const sun = Math.max(0, -out[1]) * 0.6 + Math.max(0, out[2]) * 0.4;
    const shade = Math.max(0, out[1]) * 0.55 + Math.max(0, -out[2]) * 0.3;
    let c = mix(SKIN, TAN, sun * 0.55);
    c = mix(c, PALE, shade * 0.5);
    let red = 0;
    for (const m of marks.red) red = Math.max(red, blob(p, m, 0.035));
    c = mix(c, RED, red * 0.5);
    const m = mottle(p);
    c = mix(c, m > 0 ? RED : PALE, Math.abs(m) * 0.2);
    // Work grime: thick at the hand, thinning up the forearm, broken by a fine noise.
    const g = blob(p, marks.grime, 0.3) * (0.55 + 0.45 * fine(p));
    return mix(c, DIRT, g * 0.42);
  };
}

export interface ArmOptions {
  /** Shoulder centre. */
  readonly shoulder: Vec3;
  readonly upperLength: number;
  readonly forearmLength: number;
  /** Wrist half-breadth (Y) and half-depth (Z). */
  readonly wrist: readonly [number, number];
  readonly tone: Tone;
}

export interface Arm {
  readonly elbow: Vec3;
  readonly wrist: Vec3;
}

export function arm(ctx: BuildContext, o: ArmOptions): Arm {
  const n = ctx.pick([18, 8, 5]);
  const [sx, , sz] = o.shoulder;
  const radial = (p: Vec3): Vec3 => {
    const l = dmath.hypot(p[1], p[2] - sz) || 1;
    return [0, p[1] / l, (p[2] - sz) / l];
  };
  const tone = (p: Vec3): Vec3 => o.tone(p, radial(p));
  const x0 = sx + 0.03;
  // The deltoid, sawn off flat where the arm left the body (a study cast, not a ball joint): a
  // rounded cap that swells over the stand's cup and narrows onto the upper arm, its cut face in
  // the section's dark red.
  const cut = sx - 0.05;
  // The first ring twice: ring 0 carries the section's colour into the cut face, ring 1 the skin's,
  // so the colour turns at the edge instead of fading down the cap (loft drops the zero-area band
  // between them, and ring 1's normal takes the next ring along).
  const cap: readonly (readonly [number, number, number])[] = [
    [cut, 0.047, 0.05],
    [cut, 0.047, 0.05],
    [sx - 0.025, 0.057, 0.061],
    [sx, 0.058, 0.062],
    [x0, 0.052, 0.05],
  ];
  ctx.part(
    'shoulder',
    onSkin(
      loft({
        // (Leaner rings below LOD0: far, the cap is the cut, its swell and the ring the upper arm
        // starts on, so the two parts still meet.)
        rings: (
          [cap, [cap[0], cap[1], cap[3], cap[4]], [cap[0], cap[3], cap[4]]][ctx.lod] ?? cap
        ).map((c) => ringYZ(c?.[0] ?? cut, c?.[1] ?? 0.05, c?.[2] ?? 0.05, sz, n)),
        color: (_r, i, p) => (i === 0 && ctx.lod < 2 ? SECTION : tone(p)),
        capStart: true,
        capEnd: true,
      }),
    ),
  );
  const x1 = x0 + o.upperLength;
  const x2 = x1 + o.forearmLength;
  const limb = (name: string, from: number, to: number, list: readonly Section[]): void => {
    ctx.part(
      name,
      onSkin(
        loft({
          rings: refine(list, ctx.lod).map((s) => section(from + (to - from) * s.t, s, sz, n)),
          color: (_r, _i, p) => tone(p),
          capStart: true,
          capEnd: true,
        }),
      ),
    );
  };
  limb('upper_arm', x0, x1, UPPER);
  limb('forearm', x1, x2, forearm(o.wrist[0], o.wrist[1]));
  return { elbow: [x1, 0, sz], wrist: [x2, 0, sz] };
}
