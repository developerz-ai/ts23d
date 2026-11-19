// The white shark's big fins as true planforms: first dorsal, pectorals and the crescent caudal whose
// lobes are separate pieces on their own bone chains. Dimensions come from anatomy and README.md.

import type { Mesh, Vec3 } from '@developerz.ai/ts23d';
import {
  add,
  curve3,
  even,
  gauss,
  loft,
  mixRgb,
  plate,
  scale,
  smooth,
} from '../_lib/body-plan-kit.ts';
import {
  axisZ,
  COLOUR,
  L,
  plainPoint,
  T_CAUDAL,
  T_DORSAL,
  T_PECTORAL,
  topZ,
  xOf,
} from './anatomy.ts';
import { SKIN } from './material.ts';

type Lod = 0 | 1 | 2;

const spanRings = (lod: Lod, links: number): number[] =>
  even(0, 0.992, lod === 0 ? 26 : lod === 1 ? 8 : links);
const chordSides: readonly [number, number, number] = [18, 8, 4];

export const DORSAL = { height: 0.478, length: 0.492, base: 0.39 } as const;
export const PECTORAL = { margin: 0.836 } as const;
export const CAUDAL = { upper: 0.994, lower: 0.9 } as const;

const dorsalRoot: Vec3 = [xOf(T_DORSAL), 0, topZ(T_DORSAL) - 0.02];
/** The apex stands the published height above the back directly under it. */
export const DORSAL_TIP: Vec3 = [dorsalRoot[0] - 0.3, 0, topZ(T_DORSAL + 0.3 / L) + DORSAL.height];

/** A torn notch in the first dorsal's trailing edge, 0..1 of the chord pulled back, at span u. */
export const dorsalNotch = (u: number): number =>
  0.42 * gauss((u - 0.56) / 0.035, 1) + 0.12 * gauss((u - 0.8) / 0.02, 1);

export function dorsalFin(lod: Lod): Mesh {
  const [r, tip] = [dorsalRoot, DORSAL_TIP];
  const rear: Vec3 = [r[0] - DORSAL.length, 0, topZ(T_DORSAL + DORSAL.length / 4.5) - 0.012];
  const lead = curve3([r, [r[0] - 0.115, 0, r[2] + 0.225], [r[0] - 0.225, 0, r[2] + 0.385], tip]);
  const back = curve3([
    rear,
    [r[0] - 0.385, 0, r[2] + 0.115],
    [r[0] - 0.335, 0, r[2] + 0.285],
    tip,
  ]);
  // Up close the trailing edge carries a bitten notch, healed dark round its rim.
  const notch = (u: number): number => (lod === 2 ? 0 : dorsalNotch(u));
  return plate({
    lead,
    trail: (u) => {
      const [a, b, k] = [lead(u), back(u), notch(u)];
      return [b[0] + (a[0] - b[0]) * k, b[1], b[2] + (a[2] - b[2]) * k];
    },
    thick: (u) => 0.036 * (1 - u) ** 0.8 + 0.0025,
    us: spanRings(lod, 2),
    sides: chordSides[lod],
    normal: [0, 1, 0],
    strip: SKIN,
    color: (_p, _n, u, c) =>
      mixRgb(
        mixRgb(COLOUR.back, COLOUR.backDark, 0.45 + 0.4 * u),
        COLOUR.tip,
        Math.max(0.85 * smooth(0.7, 1, c), 0.6 * smooth(0.04, 0.2, notch(u)) * smooth(0.6, 0.9, c)),
      ),
  });
}

/**
 * Parasitic copepods: small elongate brown bodies clinging in a cluster on the first dorsal's
 * trailing edge and on the pectorals' upper face, head into the flow. LOD0 only.
 */
export function copepods(lod: Lod, at: readonly Vec3[]): Mesh[] {
  if (lod !== 0) return [];
  return at.map((p, i) =>
    loft({
      us: even(0, 1, 5),
      sides: 6,
      strip: SKIN,
      point: (u, a) => {
        const len = 0.034 + 0.008 * Math.sin(i * 2.3);
        const r = 0.0085 * Math.sin(Math.PI * (0.08 + 0.84 * u)) ** 0.7;
        return [p[0] - len * (u - 0.4), p[1] + r * Math.cos(a), p[2] + 0.6 * r * Math.sin(a)];
      },
      color: (_p, _n, u) => mixRgb(COLOUR.copepod, COLOUR.tip, 0.3 * u),
    }),
  );
}

/** Copepod seats on the dorsal fin: mid-plane points on its rear third, along the notch. */
export const dorsalCopepods = (): Vec3[] =>
  [0.26, 0.3, 0.34, 0.38, 0.43, 0.47, 0.66, 0.72].map((u, i) => {
    const r = dorsalRoot;
    const lead = curve3([
      r,
      [r[0] - 0.115, 0, r[2] + 0.225],
      [r[0] - 0.225, 0, r[2] + 0.385],
      DORSAL_TIP,
    ]);
    const rear: Vec3 = [r[0] - DORSAL.length, 0, topZ(T_DORSAL + DORSAL.length / 4.5) - 0.012];
    const back = curve3([
      rear,
      [r[0] - 0.385, 0, r[2] + 0.115],
      [r[0] - 0.335, 0, r[2] + 0.285],
      DORSAL_TIP,
    ]);
    const [a, b] = [lead(u), back(u)];
    const c = 0.72 + 0.06 * (i % 2);
    // Seated on the skin of one face: the plate's half-thickness there, most on the camera side.
    const face = 0.036 * (1 - u) ** 0.8 + 0.0025;
    const lens = Math.sqrt(1 - (2 * c - 1) ** 2) * (1 - 0.65 * c);
    const side = i % 3 === 2 ? 1 : -1;
    return [a[0] + (b[0] - a[0]) * c, side * face * lens, a[2] + (b[2] - a[2]) * c];
  });

const pecRoot = (side: 1 | -1, t: number): Vec3 => {
  const p = plainPoint(t, 2.02);
  return [p[0], (p[1] - 0.05) * side, p[2] + 0.05];
};

export const pectoralTip = (side: 1 | -1): Vec3 => {
  const r = pecRoot(side, T_PECTORAL);
  return add(r, [-0.52, 0.56 * side, -0.33]);
};

/** A healed bite across a pectoral, 0..1 at (span u, chord c): an arc of tooth punctures, the
 *  bitten shark's jaw having closed over the fin's middle. */
export function biteAt(u: number, c: number): number {
  const d = Math.hypot((u - 0.42) * 1.1, (c - 0.15) * 0.7);
  const arc = gauss((d - 0.2) / 0.014, 1) * smooth(0.25, 0.4, c);
  const teeth = Math.max(0, Math.cos(Math.atan2(c - 0.15, u - 0.42) * 16)) ** 0.6;
  return Math.min(1, arc * teeth * 1.3);
}

export function pectoralFin(side: 1 | -1, lod: Lod): Mesh {
  const r = pecRoot(side, T_PECTORAL);
  const back = pecRoot(side, T_PECTORAL + 0.09);
  const tip = pectoralTip(side);
  const at = (p: Vec3, u: number, sweep: number, drop: number): Vec3 =>
    add(add(p, scale(add(tip, scale(p, -1)), u)), [sweep, 0, drop]);
  return plate({
    lead: curve3([r, at(r, 0.34, 0.05, 0.012), at(r, 0.7, 0.045, 0.012), tip]),
    trail: curve3([back, at(back, 0.32, -0.05, 0.02), at(back, 0.68, -0.03, 0.014), tip]),
    // A thick, muscular root tapering fast to a thin, flexible trailing edge and tip.
    thick: (u) => 0.08 * (1 - u) ** 1.5 + 0.004,
    us: spanRings(lod, 2),
    sides: chordSides[lod],
    strip: SKIN,
    // Grey above, white below with the black underside tip of the species; the upper face darkens
    // toward its tip and along its trailing edge too.
    color: (_p, n, u, c) => {
      const under = smooth(0.15, -0.25, n[2]);
      const edge = Math.max(smooth(0.72, 0.95, u), smooth(0.68, 0.95, c));
      const top = mixRgb(
        mixRgb(COLOUR.back, COLOUR.backDark, 0.35 + 0.4 * u),
        COLOUR.tip,
        0.9 * edge,
      );
      // A healed bite on the camera-side fin: a crescent of pale tooth scars across its middle.
      const bite = side < 0 ? biteAt(u, c) : 0;
      const low = mixRgb(COLOUR.belly, COLOUR.tip, smooth(0.8, 0.93, u));
      // Healed tooth scars are pale grey-white on the dark fin.
      return mixRgb(mixRgb(top, COLOUR.belly, 0.8 * bite), low, under);
    },
  });
}

export const CAUDAL_ROOT: Vec3 = [xOf(T_CAUDAL), 0, axisZ(T_CAUDAL)];
const R = CAUDAL_ROOT;
export const UPPER_TIP: Vec3 = [-2.25, 0, R[2] + 0.765];
export const LOWER_TIP: Vec3 = [R[0] - 0.5, 0, R[2] - 0.745];
export const FORK: Vec3 = [R[0] - 0.4, 0, R[2] - 0.03];

const lobeColour = (_p: Vec3, _n: Vec3, u: number, c: number): Vec3 =>
  mixRgb(
    mixRgb(COLOUR.back, COLOUR.backDark, 0.35 + 0.45 * u),
    COLOUR.tip,
    0.85 * Math.max(smooth(0.68, 1, c), smooth(0.8, 1, u)),
  );

export function upperLobe(lod: Lod): Mesh {
  const start: Vec3 = [R[0] + 0.16, 0, R[2] + 0.03];
  return plate({
    lead: curve3([start, [R[0] - 0.13, 0, R[2] + 0.215], [R[0] - 0.42, 0, R[2] + 0.5], UPPER_TIP]),
    trail: curve3([FORK, [R[0] - 0.47, 0, R[2] + 0.2], [R[0] - 0.56, 0, R[2] + 0.48], UPPER_TIP]),
    thick: (u) => 0.04 * (1 - u) ** 1.1 + 0.0025,
    us: spanRings(lod, 3),
    sides: chordSides[lod],
    normal: [0, 1, 0],
    strip: SKIN,
    color: lobeColour,
  });
}

export function lowerLobe(lod: Lod): Mesh {
  const start: Vec3 = [R[0] + 0.12, 0, R[2] - 0.02];
  return plate({
    lead: curve3([start, [R[0] - 0.09, 0, R[2] - 0.22], [R[0] - 0.27, 0, R[2] - 0.47], LOWER_TIP]),
    trail: curve3([FORK, [R[0] - 0.44, 0, R[2] - 0.2], [R[0] - 0.455, 0, R[2] - 0.45], LOWER_TIP]),
    thick: (u) => 0.036 * (1 - u) ** 1.1 + 0.0025,
    us: spanRings(lod, 2),
    sides: chordSides[lod],
    normal: [0, 1, 0],
    strip: SKIN,
    color: lobeColour,
  });
}

export const pectoralRoot = pecRoot;
