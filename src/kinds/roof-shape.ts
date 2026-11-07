// Roof geometry as maths, no mesh: every pitched roof here is convex, so its surface is the LOWER
// ENVELOPE (min) of a few planes over a plan outline. Gable = 2 planes, hip/pyramid = 4, gambrel =
// 4, mansard = 8, shed = 1. Facets are the plan cells where one plane is lowest; ridges and hips
// fall out as the creases between them. Local frame: `a` along the ridge, `b` across it, z up from
// the wall plate; the roof UNDERSIDE passes through the top outer edge of every wall.

import { Ts23dError, type Vec2, type Vec3 } from '../core/index.ts';
import type { StripId } from '../material/index.ts';
import { area2, clipPoly } from './faces.ts';

export type RoofType = 'gable' | 'hip' | 'pyramid' | 'mansard' | 'gambrel' | 'shed';
export type RoofSide = 'front' | 'back' | 'left' | 'right';

export interface RoofOptions {
  readonly type: RoofType;
  /** Wall-line width (X) and depth (Y) of the mass the roof sits on, metres. */
  readonly footprint: readonly [number, number];
  /** Main slope, degrees (the lower, steep slope of a mansard or gambrel). */
  readonly pitchDeg: number;
  /** Centre of the footprint at wall-plate height (top of the walls). */
  readonly at: Vec3;
  readonly color: Vec3;
  /** Roofing strip, laid in true-scale courses down the slope. Default 'slate'. */
  readonly strip?: StripId;
  /** Eave overhang past the walls, metres. Default 0.35. */
  readonly overhang?: number;
  /** Gable-end (rake) overhang; default = overhang. Hipped roofs ignore it. */
  readonly rake?: number;
  /** Slab thickness perpendicular to the slope (rafter + battens + slate). Default 0.18. */
  readonly thickness?: number;
  /** Ridge direction; default along the longer side. */
  readonly ridge?: 'x' | 'y';
  /** Shed only: the side the single slope falls toward. Default 'front' (+X). */
  readonly low?: RoofSide;
  /** Mansard / gambrel upper slope, degrees. Default 20 (mansard), 30 (gambrel). */
  readonly upperPitchDeg?: number;
  /** Mansard / gambrel: share of the half-span the lower slope covers in plan. Default 0.3 / 0.45. */
  readonly knee?: number;
}

export interface Plane {
  /** z = c + ga·a + gb·b (local, relative to the wall plate). */
  readonly c: number;
  readonly ga: number;
  readonly gb: number;
}

export interface RoofShape {
  readonly L: number;
  readonly D: number;
  /** Underside planes and the matching top planes (offset by the perpendicular thickness). */
  readonly under: readonly Plane[];
  readonly top: readonly Plane[];
  /** Plan outline at the eaves (CCW, local a/b). */
  readonly outline: readonly Vec2[];
  /** Local unit axes in world XY: a → ex, b → ey (ex × ey = +Z). */
  readonly ex: Vec2;
  readonly ey: Vec2;
  readonly thickness: number;
}

const RAD = Math.PI / 180;
const FRAMES: Record<RoofSide, [Vec2, Vec2]> = {
  // Frame whose −b side faces the named world side.
  front: [
    [0, 1],
    [-1, 0],
  ],
  back: [
    [0, -1],
    [1, 0],
  ],
  left: [
    [-1, 0],
    [0, -1],
  ],
  right: [
    [1, 0],
    [0, 1],
  ],
};

const bad = (cause: string, fix: string): Ts23dError =>
  new Ts23dError('T3D_RECIPE_INVALID', { cause, fix });

export function validateRoof(o: RoofOptions): void {
  const [w, d] = o.footprint;
  if (!(w > 0 && d > 0 && Number.isFinite(w) && Number.isFinite(d)))
    throw bad(
      `roof footprint is [${w}, ${d}]`,
      'pass the wall-line [width X, depth Y] in metres, both > 0',
    );
  const maxPitch = o.type === 'mansard' || o.type === 'gambrel' ? 85 : 75;
  if (!(o.pitchDeg >= 3 && o.pitchDeg <= maxPitch))
    throw bad(
      `${o.type} roof pitchDeg is ${o.pitchDeg}`,
      `use 3–${maxPitch}° (slate ≥ 20°, tile 30–45°, sheet metal ≥ 3°); for a flat roof use a box`,
    );
  const t = o.thickness ?? 0.18;
  if (!(t > 0 && t < 1))
    throw bad(`roof thickness is ${t}`, 'use 0.1–0.3 m (rafter + battens + slate)');
  const ov = o.overhang ?? 0.35;
  if (!(ov >= 0 && ov < 3) || !((o.rake ?? ov) >= 0))
    throw bad(`roof overhang is ${ov}`, 'use 0–1.5 m past the wall line (0 for a party wall)');
  if (o.type === 'mansard' || o.type === 'gambrel') {
    const up = o.upperPitchDeg ?? (o.type === 'mansard' ? 20 : 30);
    if (!(up > 0 && up < o.pitchDeg))
      throw bad(
        `${o.type} upperPitchDeg ${up} is not below pitchDeg ${o.pitchDeg}`,
        'the upper slope must be shallower than the lower one (mansard 70°/20°, gambrel 60°/30°)',
      );
    const k = o.knee ?? 0.3;
    if (!(k > 0 && k < 1))
      throw bad(`${o.type} knee is ${k}`, 'use a fraction 0.15–0.6 of the half-span');
  }
}

/** Planes of the roof UNDERSIDE for a type, in the local frame. */
function underPlanes(o: RoofOptions, L: number, D: number): Plane[] {
  const tp = Math.tan(o.pitchDeg * RAD);
  const side = (s: number, c = 0, k = s): Plane[] => [
    { c: c + D * k, ga: 0, gb: -s },
    { c: c + D * k, ga: 0, gb: s },
  ];
  const ends = (s: number, c = 0, k = s): Plane[] => [
    { c: c + L * k, ga: -s, gb: 0 },
    { c: c + L * k, ga: s, gb: 0 },
  ];
  switch (o.type) {
    case 'gable':
      return side(tp);
    case 'shed':
      return [{ c: D * tp, ga: 0, gb: tp }];
    case 'hip':
      return [...side(tp), ...ends(tp)];
    case 'pyramid': {
      const h = Math.min(L, D) * tp;
      return [...side(h / D), ...ends(h / L)];
    }
    case 'gambrel':
    case 'mansard': {
      const t2 = Math.tan((o.upperPitchDeg ?? (o.type === 'mansard' ? 20 : 30)) * RAD);
      const r = (o.knee ?? (o.type === 'mansard' ? 0.3 : 0.45)) * Math.min(L, D);
      // Upper plane: z = r·tp + (D − r − |b|)·t2 → c = r·tp + (D − r)·t2 with slope t2.
      const upper = (half: number): number => r * tp + (half - r) * t2 - half * t2;
      const lower = [...side(tp), ...(o.type === 'mansard' ? ends(tp) : [])];
      const top = [
        ...side(t2, upper(D), t2),
        ...(o.type === 'mansard' ? ends(t2, upper(L), t2) : []),
      ];
      return [...lower, ...top];
    }
  }
}

export function roofShape(o: RoofOptions): RoofShape {
  validateRoof(o);
  const [w, d] = o.footprint;
  const ridge = o.ridge ?? (w >= d ? 'x' : 'y');
  const low: RoofSide = o.type === 'shed' ? (o.low ?? 'front') : ridge === 'x' ? 'right' : 'front';
  const [ex, ey] = FRAMES[low];
  const L = (Math.abs(ex[0]) > 0.5 ? w : d) / 2;
  const D = (Math.abs(ex[0]) > 0.5 ? d : w) / 2;
  const ov = o.overhang ?? 0.35;
  const t = o.thickness ?? 0.18;
  const under = underPlanes(o, L, D);
  const top = under.map((p) => ({ ...p, c: p.c + t * Math.hypot(1, p.ga, p.gb) }));
  const hipped = o.type === 'hip' || o.type === 'pyramid' || o.type === 'mansard';
  const A = hipped ? 4 * (L + D + ov) : L + (o.rake ?? ov);
  const B = D + ov;
  // Eave height: the steepest-falling b-plane at the eave line; every plane must stay above it.
  const g0 = under[0] ?? { c: 0, ga: 0, gb: 1 };
  const zEave = -ov * Math.hypot(g0.ga, g0.gb);
  let outline: Vec2[] = [
    [-A, -B],
    [A, -B],
    [A, B],
    [-A, B],
  ];
  for (const p of under) outline = clipPoly(outline, (q) => zEave - zAt(p, q));
  return { L, D, under, top, outline, ex, ey, thickness: t };
}

export const zAt = (p: Plane, q: Vec2): number => p.c + p.ga * q[0] + p.gb * q[1];

/** Envelope height (min of planes) at a local plan point. */
export const envelope = (planes: readonly Plane[], q: Vec2): number =>
  Math.min(...planes.map((p) => zAt(p, q)));

/** The plan cell of each plane on the envelope (empty cells dropped), with its plane. */
export function facets(planes: readonly Plane[], outline: readonly Vec2[]): [Plane, Vec2[]][] {
  const out: [Plane, Vec2[]][] = [];
  planes.forEach((p, i) => {
    let cell: Vec2[] = [...outline];
    planes.forEach((q, j) => {
      if (j !== i && cell.length >= 3) cell = clipPoly(cell, (r) => zAt(p, r) - zAt(q, r));
    });
    if (cell.length >= 3 && Math.abs(area2(cell)) > 1e-6) out.push([p, cell]);
  });
  return out;
}

/** Local plan → world XY offset (add `at`). */
export const toWorld = (s: RoofShape, q: Vec2, z: number, at: Vec3): Vec3 => [
  at[0] + s.ex[0] * q[0] + s.ey[0] * q[1],
  at[1] + s.ex[1] * q[0] + s.ey[1] * q[1],
  at[2] + z,
];

/** World XY → local plan. */
export const toLocal = (s: RoofShape, x: number, y: number, at: Vec3): Vec2 => {
  const dx = x - at[0];
  const dy = y - at[1];
  return [dx * s.ex[0] + dy * s.ex[1], dx * s.ey[0] + dy * s.ey[1]];
};

/** World z of the roof's top surface at world (x, y) — chimneys, dormers, aerials sit on this. */
export function roofHeightAt(o: RoofOptions, x: number, y: number): number {
  const s = roofShape(o);
  return o.at[2] + envelope(s.top, toLocal(s, x, y, o.at));
}

/** World z of the highest point of the roof surface (ridge or apex), slab included. */
export function ridgeHeight(o: RoofOptions): number {
  const s = roofShape(o);
  let z = -Infinity;
  for (const [p, cell] of facets(s.top, s.outline))
    for (const q of cell) z = Math.max(z, zAt(p, q));
  return o.at[2] + z;
}
