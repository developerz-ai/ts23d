// The white shark's big fins as true planforms: first dorsal, pectorals and the crescent caudal whose
// lobes are separate pieces on their own bone chains. Dimensions come from anatomy and README.md.

import type { Mesh, Vec3 } from '@developerz.ai/ts23d';
import { add, curve3, even, mixRgb, plate, scale, smooth } from '../_lib/body-plan-kit.ts';
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
  even(0, 0.992, lod === 0 ? 14 : lod === 1 ? 6 : links);
const chordSides: readonly [number, number, number] = [18, 8, 4];

export const DORSAL = { height: 0.478, length: 0.492, base: 0.39 } as const;
export const PECTORAL = { margin: 0.836 } as const;
export const CAUDAL = { upper: 0.994, lower: 0.82 } as const;

const dorsalRoot: Vec3 = [xOf(T_DORSAL), 0, topZ(T_DORSAL) - 0.02];
/** The apex stands the published height above the back directly under it. */
export const DORSAL_TIP: Vec3 = [dorsalRoot[0] - 0.3, 0, topZ(T_DORSAL + 0.3 / L) + DORSAL.height];

export function dorsalFin(lod: Lod): Mesh {
  const [r, tip] = [dorsalRoot, DORSAL_TIP];
  const rear: Vec3 = [r[0] - DORSAL.length, 0, topZ(T_DORSAL + DORSAL.length / 4.5) - 0.012];
  return plate({
    lead: curve3([r, [r[0] - 0.115, 0, r[2] + 0.225], [r[0] - 0.225, 0, r[2] + 0.385], tip]),
    trail: curve3([rear, [r[0] - 0.385, 0, r[2] + 0.115], [r[0] - 0.335, 0, r[2] + 0.285], tip]),
    thick: (u) => 0.036 * (1 - u) ** 0.8 + 0.0025,
    us: spanRings(lod, 2),
    sides: chordSides[lod],
    normal: [0, 1, 0],
    strip: SKIN,
    color: (_p, _n, u, c) =>
      mixRgb(
        mixRgb(COLOUR.back, COLOUR.backDark, 0.45 + 0.4 * u),
        COLOUR.tip,
        0.5 * smooth(0.82, 1, c),
      ),
  });
}

const pecRoot = (side: 1 | -1, t: number): Vec3 => {
  const p = plainPoint(t, 2.02);
  return [p[0], (p[1] - 0.05) * side, p[2] + 0.05];
};

export const pectoralTip = (side: 1 | -1): Vec3 => {
  const r = pecRoot(side, T_PECTORAL);
  return add(r, [-0.52, 0.56 * side, -0.33]);
};

export function pectoralFin(side: 1 | -1, lod: Lod): Mesh {
  const r = pecRoot(side, T_PECTORAL);
  const back = pecRoot(side, T_PECTORAL + 0.09);
  const tip = pectoralTip(side);
  const at = (p: Vec3, u: number, sweep: number, drop: number): Vec3 =>
    add(add(p, scale(add(tip, scale(p, -1)), u)), [sweep, 0, drop]);
  return plate({
    lead: curve3([r, at(r, 0.34, 0.05, 0.012), at(r, 0.7, 0.045, 0.012), tip]),
    trail: curve3([back, at(back, 0.32, -0.05, 0.02), at(back, 0.68, -0.03, 0.014), tip]),
    thick: (u) => 0.033 * (1 - u) ** 0.9 + 0.0025,
    us: spanRings(lod, 2),
    sides: chordSides[lod],
    strip: SKIN,
    // Grey above, white below with the black underside tip of the species.
    color: (_p, n, u) => {
      const under = smooth(0.15, -0.25, n[2]);
      const top = mixRgb(COLOUR.back, COLOUR.backDark, 0.35 + 0.4 * u);
      const low = mixRgb(COLOUR.belly, COLOUR.tip, smooth(0.8, 0.93, u));
      return mixRgb(top, low, under);
    },
  });
}

export const CAUDAL_ROOT: Vec3 = [xOf(T_CAUDAL), 0, axisZ(T_CAUDAL)];
const R = CAUDAL_ROOT;
export const UPPER_TIP: Vec3 = [-2.25, 0, R[2] + 0.765];
export const LOWER_TIP: Vec3 = [R[0] - 0.43, 0, R[2] - 0.7];
export const FORK: Vec3 = [R[0] - 0.4, 0, R[2] - 0.03];

const lobeColour = (_p: Vec3, _n: Vec3, u: number, c: number): Vec3 =>
  mixRgb(
    mixRgb(COLOUR.back, COLOUR.backDark, 0.35 + 0.45 * u),
    COLOUR.tip,
    0.45 * smooth(0.78, 1, c),
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
