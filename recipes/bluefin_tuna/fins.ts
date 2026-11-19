// The bluefin's fins as planforms: spiny first dorsal, tall falcate second dorsal and anal, short
// pectorals, finlet rows and the crescent tail on two lobe chains.

import type { Mesh, Vec3 } from '@developerz.ai/ts23d';
import {
  add,
  curve3,
  even,
  mixRgb,
  noise,
  type PlateSpec,
  plate,
  smooth,
} from '../_lib/body-plan-kit.ts';
import { toBand } from './material.ts';
import {
  belowZ,
  COLOUR,
  SKIN as FIN,
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

/**
 * A median fin: a lens plate on the midplane. Up close it carries its rays as low ridges running
 * root to tip on both faces, and a trailing edge frayed into small nicks (seeded per fin), pale and
 * rough where the membrane has torn back between the rays.
 */
const median = (
  lod: Lod,
  lead: readonly Vec3[],
  trail: readonly Vec3[],
  thick: number,
  color: PlateSpec['color'],
  seed = 0,
  rays = 0,
): Mesh => {
  const [l, t] = [curve3(lead), curve3(trail)];
  const fray = (u: number): number =>
    lod === 2
      ? 0
      : 0.09 * smooth(0.15, 0.4, u) * Math.max(0, noise(u * 34, seed, 31) - 0.42) ** 1.2;
  const us = lod === 0 ? even(0, 0.99, 28) : span(lod, 1);
  const sides = lod === 0 && rays > 0 ? 30 : chord[lod];
  const m = plate({
    lead: l,
    // Nicks: the trailing edge pulls back toward the leading one where the membrane is torn.
    trail: (u) => {
      const [a, b] = [l(u), t(u)];
      const k = fray(u);
      return [b[0] + (a[0] - b[0]) * k, b[1] + (a[1] - b[1]) * k, b[2] + (a[2] - b[2]) * k];
    },
    thick: (u) => thick * (1 - u) ** 0.9 + 0.0012,
    us,
    sides,
    normal: [0, 1, 0],
    strip: FIN,
    color: (p, n, u, c) => {
      // Rays read as fine dark lines fanning root to tip, membrane lighter between them.
      const ray = lod < 2 && rays > 0 ? Math.max(0, Math.cos(c * Math.PI * rays)) ** 6 : 0;
      const lined = mixRgb(
        color(p, n, u, c),
        COLOUR.groove,
        0.45 * ray * (1 - smooth(0.6, 0.9, u)),
      );
      // The thin trailing margin lets light through: paler, and torn back to pale where frayed.
      const margin = mixRgb(lined, COLOUR.steel, 0.35 * smooth(0.82, 0.97, c));
      return mixRgb(
        margin,
        COLOUR.scratch,
        0.7 * smooth(0.75, 0.98, c) * smooth(0, 0.015, fray(u)),
      );
    },
  });
  const ridged = lod === 0 && rays > 0 ? rayRidges(m, us, sides, rays) : m;
  return toBand(ridged, (i) => {
    const ring = sides + 1;
    const r = Math.min(us.length - 1, Math.floor(i / ring));
    const c = 0.5 + 0.5 * Math.cos(((i % ring) / sides) * Math.PI * 2);
    return [
      'fin',
      'edge',
      Math.max(smooth(0.85, 1, c) * smooth(0.6, 0.95, us[r] ?? 0), fray(us[r] ?? 0) * 30),
    ];
  });
};

/** A plain fin plate on the fin band of the strip. */
const finPlate = (spec: PlateSpec): Mesh => toBand(plate(spec), 'fin');

/** Raise `rays` low ridges across the chord on both faces of a lens plate (rows of sides + 1). */
function rayRidges(m: Mesh, us: readonly number[], sides: number, rays: number): Mesh {
  const positions = new Float32Array(m.positions);
  const ring = sides + 1;
  for (let i = 0; i < us.length * ring; i++) {
    const a = ((i % ring) / sides) * Math.PI * 2;
    // Near the tip the chord is too short to hold a ridge without folding: they fade out.
    const fade = 1 - smooth(0.55, 0.85, us[Math.floor(i / ring)] ?? 1);
    const c = 0.5 + 0.5 * Math.cos(a);
    // Rays fan from the root: each face swells by a share of its own thickness over a ray and
    // dips between rays, so the ridges fade with the lens toward both edges and the tip.
    const y = positions[i * 3 + 1] ?? 0;
    positions[i * 3 + 1] =
      y * (1 + 0.28 * fade * Math.cos(c * Math.PI * rays) * Math.sin(Math.PI * c));
  }
  return { ...m, positions, normals: lensNormals(positions, m.indices, us.length, sides) };
}

/**
 * Normals of a ridged lens plate, as `plate`/`loft` build them: area-weighted face normals (the
 * winding is already outward), the seam column shared, and on the two sharp edges (sin a = 0) the
 * normal laid in the plate (the midplane is y = 0, so its y part is dropped).
 */
function lensNormals(
  P: Float32Array,
  indices: Uint32Array,
  rows: number,
  sides: number,
): Float32Array {
  const ring = sides + 1;
  const acc = new Float64Array(P.length);
  const push = (v: number, f: readonly number[]): void => {
    for (let k = 0; k < 3; k++) acc[v * 3 + k] = (acc[v * 3 + k] ?? 0) + (f[k] ?? 0);
  };
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t] ?? 0, indices[t + 1] ?? 0, indices[t + 2] ?? 0];
    const u = [0, 1, 2].map((k) => (P[b * 3 + k] ?? 0) - (P[a * 3 + k] ?? 0));
    const v = [0, 1, 2].map((k) => (P[c * 3 + k] ?? 0) - (P[a * 3 + k] ?? 0));
    const f = [
      (u[1] ?? 0) * (v[2] ?? 0) - (u[2] ?? 0) * (v[1] ?? 0),
      (u[2] ?? 0) * (v[0] ?? 0) - (u[0] ?? 0) * (v[2] ?? 0),
      (u[0] ?? 0) * (v[1] ?? 0) - (u[1] ?? 0) * (v[0] ?? 0),
    ];
    for (const w of [a, b, c]) {
      push(w, f);
      // The seam column is one column twice: both copies share the normal.
      const j = w < rows * ring ? w % ring : -1;
      if (j === 0) push(w + sides, f);
      if (j === sides) push(w - sides, f);
    }
  }
  const out = new Float32Array(P.length);
  for (let w = 0; w < P.length / 3; w++) {
    const j = w % ring;
    const edge = w < rows * ring && Math.abs(Math.sin((j / sides) * Math.PI * 2)) <= 1e-6;
    const n = [acc[w * 3] ?? 0, edge ? 0 : (acc[w * 3 + 1] ?? 0), acc[w * 3 + 2] ?? 0];
    const l = Math.hypot(n[0] ?? 0, n[1] ?? 0, n[2] ?? 0) || 1;
    for (let k = 0; k < 3; k++) out[w * 3 + k] = (n[k] ?? 0) / l;
  }
  return out;
}

export const HEIGHT = { dorsal1: 0.22, dorsal2: 0.31, anal: 0.29, pectoral: 0.33 } as const;
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
    1,
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
  return median(
    lod,
    lead,
    trail,
    0.011,
    (_p, _n, u) =>
      mixRgb(
        mixRgb(COLOUR.fin, COLOUR.yellow, 0.55 * smooth(0, 0.5, u)),
        COLOUR.edge,
        smooth(0.8, 1, u),
      ),
    2,
    13,
  );
}

export function anal(lod: Lod): Mesh {
  const [lead, trail] = sickle(xOf(0.545), belowZ(0.545) + SINK, -1, HEIGHT.anal + SINK);
  return median(
    lod,
    lead,
    trail,
    0.01,
    (_p, _n, u) =>
      mixRgb(
        mixRgb(COLOUR.silver, COLOUR.yellow, 0.65 * smooth(0, 0.45, u)),
        COLOUR.edge,
        smooth(0.82, 1, u),
      ),
    3,
    12,
  );
}

function finlet(t: number, dir: 1 | -1, size: number, lod: Lod): Mesh {
  const x = xOf(t);
  const z = dir > 0 ? topZ(t) - 0.006 : belowZ(t) + 0.006;
  const tip: Vec3 = [x - size * 1.15, 0, z + dir * size * 0.72];
  return finPlate({
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

/** Far away the finlet rows are one flat yellow strip each, top and bottom, so the colour stays. */
export function finletStrips(lod: Lod): Mesh[] {
  if (lod !== 2) return [];
  return ([1, -1] as const).map((dir) => {
    const [t0, t1] = dir > 0 ? [0.645, 0.925] : [0.7, 0.925];
    const edge = (t: number, k: number): Vec3 => {
      const z = dir > 0 ? topZ(t) - 0.008 : belowZ(t) + 0.008;
      return [xOf(t), 0, z + dir * k * (0.05 - 0.02 * ((t - t0) / (t1 - t0)))];
    };
    return toBand(
      plate({
        lead: (u) => edge(t0 + (t1 - t0) * u, 0),
        trail: (u) => edge(t0 + (t1 - t0) * u, 1),
        thick: () => 0.002,
        us: [0, 1],
        sides: 4,
        normal: [0, 1, 0],
        strip: FIN,
        color: () => COLOUR.finlet,
      }),
      'fin',
    );
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
  return finPlate({
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
    return finPlate({
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
    return finPlate({
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
  median(
    lod,
    [
      [R[0] + 0.07, 0, Z0 + dir * 0.006],
      [R[0] - 0.05, 0, Z0 + dir * 0.09],
      [R[0] - 0.135, 0, Z0 + dir * 0.205],
      tip,
    ],
    [NOTCH, [R[0] - 0.165, 0, Z0 + dir * 0.085], [R[0] - 0.215, 0, Z0 + dir * 0.2], tip],
    0.011,
    lobeColour,
    dir > 0 ? 4 : 5,
    16,
  );

export const upperLobe = (lod: Lod): Mesh => lobe(lod, UPPER_TIP, 1);
export const lowerLobe = (lod: Lod): Mesh => lobe(lod, LOWER_TIP, -1);
