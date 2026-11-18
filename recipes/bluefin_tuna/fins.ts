// The bluefin's fins as planforms: spiny first dorsal, tall falcate second dorsal and anal, short
// pectorals, finlet rows and the crescent tail on two lobe chains.

import type { Mesh, Vec3 } from '@developerz.ai/ts23d';
import { add, curve3, even, mixRgb, type PlateSpec, plate, smooth } from '../_lib/body-plan-kit.ts';
import {
  belowZ,
  COLOUR,
  FIN,
  FL,
  plainPoint,
  T_TAIL,
  tOf as tOfX,
  topZ,
  xOf,
  Z0,
} from './shape.ts';

type Lod = 0 | 1 | 2;
const span = (lod: Lod, links: number): number[] =>
  even(0, 0.99, lod === 0 ? 10 : lod === 1 ? 5 : links);
const chord: readonly [number, number, number] = [14, 8, 4];

const median = (
  lod: Lod,
  lead: readonly Vec3[],
  trail: readonly Vec3[],
  thick: number,
  color: PlateSpec['color'],
): Mesh =>
  plate({
    lead: curve3(lead),
    trail: curve3(trail),
    thick: (u) => thick * (1 - u) ** 0.9 + 0.0012,
    us: span(lod, 1),
    sides: chord[lod],
    normal: [0, 1, 0],
    strip: FIN,
    color,
  });

export const HEIGHT = { dorsal1: 0.22, dorsal2: 0.31, anal: 0.29, pectoral: 0.35 } as const;
const SINK = 0.018;

export function dorsal1(lod: Lod): Mesh {
  const [x, z] = [xOf(0.275), topZ(0.275) - SINK];
  const rear = 0.165 * FL;
  const tip: Vec3 = [x - 0.075, 0, z + HEIGHT.dorsal1 + SINK * 0.4];
  return median(
    lod,
    [[x, 0, z], [x - 0.028, 0, z + 0.12], tip],
    [[x - rear, 0, topZ(0.44) - SINK], [x - 0.215, 0, z + 0.042], [x - 0.125, 0, z + 0.105], tip],
    0.009,
    (_p, _n, u, c) => mixRgb(COLOUR.fin, COLOUR.yellow, 0.4 * smooth(0.25, 0.9, c) * (1 - u * 0.4)),
  );
}

const sickle = (x: number, z: number, dir: 1 | -1, h: number): [Vec3[], Vec3[]] => {
  const tip: Vec3 = [x - 0.27, 0, z + dir * h];
  return [
    [[x, 0, z], [x - 0.075, 0, z + dir * h * 0.42], [x - 0.17, 0, z + dir * h * 0.77], tip],
    [[x - 0.2, 0, z], [x - 0.185, 0, z + dir * h * 0.3], [x - 0.215, 0, z + dir * h * 0.66], tip],
  ];
};

export function dorsal2(lod: Lod): Mesh {
  const [lead, trail] = sickle(xOf(0.5), topZ(0.5) - SINK, 1, HEIGHT.dorsal2 + SINK);
  return median(lod, lead, trail, 0.011, (_p, _n, u) =>
    mixRgb(
      mixRgb(COLOUR.fin, COLOUR.yellow, 0.55 * smooth(0, 0.5, u)),
      COLOUR.edge,
      smooth(0.8, 1, u),
    ),
  );
}

export function anal(lod: Lod): Mesh {
  const [lead, trail] = sickle(xOf(0.545), belowZ(0.545) + SINK, -1, HEIGHT.anal + SINK);
  return median(lod, lead, trail, 0.01, (_p, _n, u) =>
    mixRgb(
      mixRgb(COLOUR.silver, COLOUR.yellow, 0.65 * smooth(0, 0.45, u)),
      COLOUR.edge,
      smooth(0.82, 1, u),
    ),
  );
}

function finlet(t: number, dir: 1 | -1, size: number, lod: Lod): Mesh {
  const x = xOf(t);
  const z = dir > 0 ? topZ(t) - 0.006 : belowZ(t) + 0.006;
  const tip: Vec3 = [x - size * 1.15, 0, z + dir * size * 0.72];
  return plate({
    lead: curve3([[x, 0, z], [x - size * 0.5, 0, z + dir * size * 0.45], tip]),
    trail: curve3([[x - size * 0.75, 0, z], [x - size * 0.9, 0, z + dir * size * 0.34], tip]),
    thick: (u) => 0.0035 * (1 - u) + 0.0008,
    us: even(0, 0.98, lod === 0 ? 3 : 1),
    sides: lod === 0 ? 6 : 4,
    normal: [0, 1, 0],
    strip: FIN,
    color: (_p, _n, u) => mixRgb(COLOUR.finlet, COLOUR.edge, smooth(0.62, 1, u)),
  });
}

/** Dorsal and anal finlet rows, shrinking toward the tail. */
export function finlets(lod: Lod): Mesh[] {
  if (lod === 2) return [];
  const row = (from: number, n: number, dir: 1 | -1): Mesh[] =>
    Array.from({ length: n }, (_, i) => {
      const k = i / (n - 1);
      return finlet(from + (0.925 - from) * k, dir, 0.062 - 0.024 * k, lod);
    });
  return [...row(0.645, 9, 1), ...row(0.7, 8, -1)];
}

const pecRoot = (side: 1 | -1, t: number, a: number): Vec3 => {
  const p = plainPoint(t, a);
  return [p[0], (p[1] - 0.02) * side, p[2]];
};

/** Held back along the flank: the leading edge on top, the blade lying close to the body. */
export const pectoralTip = (side: 1 | -1): Vec3 =>
  add(pecRoot(side, 0.262, 1.62), [-HEIGHT.pectoral * 0.93, 0.105 * side, -0.075]);
export const pectoralBase = (side: 1 | -1): Vec3 => pecRoot(side, 0.268, 1.9);

export function pectoral(side: 1 | -1, lod: Lod): Mesh {
  const [r, low, tip] = [pecRoot(side, 0.262, 1.62), pecRoot(side, 0.275, 2.18), pectoralTip(side)];
  return plate({
    lead: curve3([
      r,
      add(r, [-0.12, 0.05 * side, 0.004]),
      add(r, [-0.235, 0.086 * side, -0.026]),
      tip,
    ]),
    trail: curve3([
      low,
      add(low, [-0.08, 0.05 * side, 0.03]),
      add(low, [-0.17, 0.08 * side, 0.052]),
      tip,
    ]),
    thick: (u) => 0.01 * (1 - u) + 0.0015,
    us: span(lod, 2),
    sides: chord[lod],
    strip: FIN,
    color: (_p, n, u) =>
      mixRgb(
        mixRgb(COLOUR.fin, COLOUR.silver, smooth(0.1, -0.5, n[1] * side)),
        COLOUR.edge,
        0.45 * smooth(0.6, 1, u),
      ),
  });
}

/** The first dorsal's spines stand proud of the membrane, the scalloped edge of the species. */
export function dorsalSpines(lod: Lod): Mesh[] {
  if (lod !== 0) return [];
  const [x0, n] = [xOf(0.275), 13];
  return Array.from({ length: n }, (_, i) => {
    const k = i / (n - 1);
    const x = x0 - 0.03 - k * 0.285;
    const z = topZ(tOfX(x)) - SINK;
    const h = (HEIGHT.dorsal1 + SINK) * (1 - k) ** 1.25 * 0.84 + 0.012;
    const tip: Vec3 = [x - 0.03 - 0.03 * k, 0, z + h];
    return plate({
      lead: curve3([[x + 0.005, 0, z], [x - 0.012, 0, z + h * 0.55], tip]),
      trail: curve3([[x - 0.011, 0, z], [x - 0.022, 0, z + h * 0.5], tip]),
      thick: (u) => 0.0032 * (1 - u) + 0.0006,
      us: even(0, 0.98, 3),
      sides: 6,
      normal: [0, 1, 0],
      strip: FIN,
      color: (_p, _n, u) => mixRgb(COLOUR.fin, COLOUR.yellow, 0.5 * u),
    });
  });
}

export function pelvics(lod: Lod): Mesh[] {
  return ([1, -1] as const).map((s) => {
    const x = xOf(0.29);
    const z = belowZ(0.29) + 0.012;
    const r: Vec3 = [x, 0.05 * s, z];
    const tip = add(r, [-0.19, 0.045 * s, -0.07]);
    return plate({
      lead: curve3([r, add(r, [-0.09, 0.03 * s, -0.045]), tip]),
      trail: curve3([add(r, [-0.09, 0, 0.008]), add(r, [-0.14, 0.02 * s, -0.022]), tip]),
      thick: (u) => 0.006 * (1 - u) + 0.001,
      us: even(0, 0.98, lod === 0 ? 5 : 1),
      sides: lod === 0 ? 8 : 4,
      strip: FIN,
      color: (_p, n) => mixRgb(COLOUR.silver, COLOUR.fin, smooth(-0.3, 0.3, n[2])),
    });
  });
}

export const TAIL_ROOT: Vec3 = [xOf(T_TAIL), 0, Z0];
const R = TAIL_ROOT;
/** Tip-to-tip span about 33 % of fork length, read off the side-view reference (README). */
export const UPPER_TIP: Vec3 = [R[0] - 0.235, 0, Z0 + 0.335];
export const LOWER_TIP: Vec3 = [R[0] - 0.235, 0, Z0 - 0.325];
const NOTCH: Vec3 = [R[0] - 0.105, 0, Z0];

const lobeColour: PlateSpec['color'] = (_p, _n, u, c) =>
  mixRgb(mixRgb(COLOUR.fin, COLOUR.back, u), COLOUR.yellow, 0.14 * smooth(0.3, 0.9, c) * (1 - u));

const lobe = (lod: Lod, tip: Vec3, dir: 1 | -1): Mesh =>
  plate({
    lead: curve3([
      [R[0] + 0.07, 0, Z0 + dir * 0.006],
      [R[0] - 0.05, 0, Z0 + dir * 0.09],
      [R[0] - 0.135, 0, Z0 + dir * 0.205],
      tip,
    ]),
    trail: curve3([
      NOTCH,
      [R[0] - 0.165, 0, Z0 + dir * 0.085],
      [R[0] - 0.215, 0, Z0 + dir * 0.2],
      tip,
    ]),
    thick: (u) => 0.012 * (1 - u) ** 1.1 + 0.001,
    us: span(lod, 2),
    sides: chord[lod],
    normal: [0, 1, 0],
    strip: FIN,
    color: lobeColour,
  });

export const upperLobe = (lod: Lod): Mesh => lobe(lod, UPPER_TIP, 1);
export const lowerLobe = (lod: Lod): Mesh => lobe(lod, LOWER_TIP, -1);
