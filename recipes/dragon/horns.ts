// Horns: the signature silhouette, grown OUT of the skull (never glued on). Every horn has a bony
// boss — a raised mound ~1.45× its base radius, smooth-unioned into the skull with a blend of
// ~0.3× the radius, so skin flows up onto it — and its root is buried in that boss (≥ 0.5× the
// radius below the surface). The horn itself is a log-spiral sweep following the skull's flow
// lines (back and slightly out, curling up), ringed near the base, its colour turning from skin to
// keratin over the first few centimetres.
//   main pair  back and out, then up (ibex-like rings) — their own parts, socketed in boss parts
//   cheek pair out over the jaw hinge, curling forward
//   frill      two short horns along the back of the jaw line
//   nose       a short hooked horn on the nasal ridge
// Left side; the head mirrors them.

import {
  type Field,
  type Mesh,
  merge,
  place,
  type SculptEdit,
  type Vec3,
} from '@developerz.ai/ts23d';
import { v3 } from '../_lib/creature/curve.ts';
import { type HornOptions, hornTube } from '../_lib/creature/horn.ts';
import { blob } from '../_lib/creature/lowpoly.ts';
import { roundCone } from '../_lib/creature/skin.ts';
import { C, HORN } from './palette.ts';

interface HornSpec {
  /** Centre of the boss on the skull. */
  readonly boss: Vec3;
  readonly dir: Vec3;
  readonly length: number;
  readonly radius: number;
  /** Curl toward this direction (world), degrees in total, log-spiral tightening. */
  readonly toward: Vec3;
  readonly bend: number;
  readonly spiral: number;
  readonly rings: number;
  readonly twist?: number;
}

const SPECS: readonly HornSpec[] = [
  // Main horns: back and out, then up.
  {
    boss: [2.44, 0.15, 3.55],
    dir: [-1, 0.42, 0.42],
    length: 1.15,
    radius: 0.088,
    toward: [0.2, 0.15, 1],
    bend: 66,
    spiral: 1.6,
    rings: 10,
    twist: 25,
  },
  // Cheek horns: out and back over the jaw hinge, curling forward at the tip.
  {
    boss: [2.36, 0.235, 3.36],
    dir: [-0.8, 0.85, -0.05],
    length: 0.56,
    radius: 0.056,
    toward: [0.4, 0.2, 0.6],
    bend: 48,
    spiral: 1.2,
    rings: 6,
  },
  // Frill horns along the back of the jaw line.
  {
    boss: [2.29, 0.25, 3.22],
    dir: [-0.8, 0.7, -0.35],
    length: 0.28,
    radius: 0.04,
    toward: [0, 0, 1],
    bend: 28,
    spiral: 1,
    rings: 0,
  },
  {
    boss: [2.36, 0.235, 3.12],
    dir: [-0.7, 0.65, -0.6],
    length: 0.22,
    radius: 0.036,
    toward: [0, 0, 1],
    bend: 28,
    spiral: 1,
    rings: 0,
  },
  // Nose horn: short and hooked back.
  {
    boss: [3.28, 0, 3.4],
    dir: [0.25, 0, 1],
    length: 0.17,
    radius: 0.045,
    toward: [-1, 0, 0],
    bend: 38,
    spiral: 1,
    rings: 0,
  },
];

/** Boss mound radius relative to the horn's base radius, and the horn root's depth in it. */
const BOSS = 1.45;
const ROOT_DEPTH = 0.6;
/** Half-width of the skull strip left between the two main bosses over the crown. */
const MIDLINE = 0.02;

const unit = (s: HornSpec): Vec3 => v3.norm(s.dir);
/** The buried root: below the boss centre, along the horn's axis. */
const rootOf = (s: HornSpec): Vec3 => v3.sub(s.boss, v3.mul(unit(s), s.radius * ROOT_DEPTH));

/** Boss mounds for the head sculpt (left; the head mirrors). */
export function hornBossEdits(): SculptEdit[] {
  return SPECS.map((s) => ({
    shape: 'ellipsoid',
    at: v3.add(s.boss, v3.mul(unit(s), s.radius * 0.15)),
    size: [s.radius * BOSS, s.radius * BOSS, s.radius * BOSS * 0.85],
    blend: s.radius * 0.35,
    color: C.back,
  }));
}

function hornOptions(s: HornSpec, lod: number): HornOptions {
  const segs = Math.max(4, Math.round((s.length / 1.15) * ([40, 12, 5][lod] ?? 5)));
  return {
    base: rootOf(s),
    dir: s.dir,
    length: s.length + s.radius * ROOT_DEPTH,
    radius: s.radius,
    tip: [0.008, 0.016, 0.04][lod] ?? 0.04,
    axis: v3.cross(unit(s), v3.norm(s.toward)),
    bend: s.bend,
    spiral: s.spiral,
    segments: segs,
    rings: lod === 0 ? s.rings : 0,
    ringDepth: 0.08,
    taper: 0.8,
    colors: HORN,
    skin: C.back,
    skinLen: s.radius * (ROOT_DEPTH + 0.6),
    ...(s.twist ? { twist: s.twist } : {}),
  };
}

const mirrored = (m: Mesh): Mesh => merge([m, place(m, { scale: [1, -1, 1] })]);
const sides = (lod: number): number => [16, 10, 4][lod] ?? 4;

/** The main horns (left, right) as their own meshes. */
export function mainHorns(lod: 0 | 1 | 2): [Mesh, Mesh] {
  const s = SPECS[0];
  if (!s)
    return [
      blob([0, 0, 0], [0.01, 0.01, 0.01], { rings: 2, sides: 3, color: C.horn }),
      blob([0, 0, 0], [0.01, 0.01, 0.01], { rings: 2, sides: 3, color: C.horn }),
    ];
  const left = hornTube(hornOptions(s, lod), sides(lod));
  return [left, place(left, { scale: [1, -1, 1] })];
}

/** Every other horn, both sides, merged (LOD2 drops the frill). */
export function minorHorns(lod: 0 | 1 | 2): Mesh {
  const specs = SPECS.slice(1).filter((_, i) => lod < 2 || i === 0 || i === 3);
  return mirrored(merge(specs.map((s) => hornTube(hornOptions(s, lod), sides(lod)))));
}

/** The main horn's socket: where it is rooted in its boss, and the axis into the skull. */
export function mainHornSocket(side: 1 | -1): { at: Vec3; axis: Vec3 } {
  const s = SPECS[0];
  const f = (p: Vec3): Vec3 => [p[0], p[1] * side, p[2]];
  if (!s) return { at: [0, 0, 0], axis: [0, 0, -1] };
  return { at: f(s.boss), axis: f(v3.mul(unit(s), -1)) };
}

/** Region (negative inside) around a main horn's boss: split off as the `horn_boss` part. */
export function bossRegion(grow: number, side: 1 | -1 = 1): Field {
  const s = SPECS[0];
  if (!s) return () => 1;
  const f = (p: Vec3): Vec3 => [p[0], p[1] * side, p[2]];
  const r = s.radius * BOSS + 0.015 + grow;
  const cone = roundCone(
    f(v3.sub(s.boss, v3.mul(unit(s), 0.12))),
    f(v3.add(s.boss, v3.mul(unit(s), 0.18))),
    r,
    r,
  );
  // Each boss stays on its own side of the midline (the two cones would otherwise meet over the
  // crown and the split pieces run into each other); the skull keeps a strip between them.
  const edge = Math.max(MIDLINE - grow, 0.005);
  return (p) => Math.max(cone(p), edge - p[1] * side);
}

/** Both boss regions, folded |y| (the head's holes). */
export const bossRegions = (grow: number): Field => {
  const l = bossRegion(grow, 1);
  return (p) => l([p[0], Math.abs(p[1]), p[2]]);
};

/** Box around one boss region. */
export function bossBounds(side: 1 | -1): [Vec3, Vec3] {
  const s = SPECS[0];
  const c: Vec3 = s ? [s.boss[0], s.boss[1] * side, s.boss[2]] : [0, 0, 0];
  const r = 0.36;
  return [
    [c[0] - r, c[1] - r, c[2] - r],
    [c[0] + r, c[1] + r, c[2] + r],
  ];
}

/** Far LOD boss: a blob on the skull. */
export function bossLowpoly(side: 1 | -1): Mesh {
  const s = SPECS[0];
  const c: Vec3 = s ? [s.boss[0], s.boss[1] * side, s.boss[2]] : [0, 0, 0];
  const r = (s?.radius ?? 0.08) * BOSS;
  return blob(c, [r, r, r * 0.85], { rings: 3, sides: 6, color: C.back });
}

/** The main horn's buried root (left), its base radius and the boss centre, for tests. */
export function mainHornRoot(): { root: Vec3; radius: number; boss: Vec3 } {
  const s = SPECS[0];
  if (!s) return { root: [0, 0, 0], radius: 0, boss: [0, 0, 0] };
  return { root: rootOf(s), radius: s.radius, boss: s.boss };
}
