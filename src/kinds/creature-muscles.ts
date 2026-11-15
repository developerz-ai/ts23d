// Fibre-aligned muscles as sculpt edits (left side; the body sculpt mirrors). Each muscle is a
// flattened ellipsoid from origin to insertion: its long axis along the fibres, its flat face
// turned out of the body, seated on the masses under it (probed: its belly rises `rise` × its
// thickness above that surface, so a landmark guessed a little off still shows the same amount),
// blended tightly (0.25 × its width, C2 kernel) so the separations between muscles read. The
// quadruped's muscle map is creature-muscle-map.ts; `build.muscle` (0..1, default per family)
// scales bellies.

import type { Vec3 } from '../core/index.ts';
import { type Field, type SculptEdit, sculptField } from '../primitives/index.ts';
import type { Bones } from './creature-bones.ts';
import { v3 } from './creature-curve.ts';
import { trunkMuscles } from './creature-muscle-map.ts';
import type { CreatureSpec } from './creature-spec.ts';

const DEG = 180 / Math.PI;

export interface FibreMuscle {
  readonly name: string;
  /** Origin and insertion, world (left side). */
  readonly from: Vec3;
  readonly to: Vec3;
  /** Belly half-width across the fibres and half-thickness out of the body, metres. */
  readonly width: number;
  readonly thick: number;
  /** Direction the flat face turns to (out of the body). */
  readonly out: Vec3;
  /** A bone landmark (scapula, tuber coxae): not scaled by `build.muscle`. */
  readonly bone?: boolean;
  /** Share of the belly's thickness standing above the surface under it (default 0.4). */
  readonly rise?: number;
  /** Blend radius floor, metres: a broad bony crest (the withers) that must not show edges. */
  readonly blend?: number;
}

/** Default muscle definition per family: lean runners less, heavy diggers/grapplers more. */
const DEFINITION: Readonly<Record<string, number>> = {
  canid: 0.85,
  felid: 1,
  ursid: 0.7,
  equid: 0.9,
};

export function muscleDefinition(s: CreatureSpec): number {
  return s.build?.muscle ?? DEFINITION[s.family ?? s.face?.preset ?? ''] ?? 0.8;
}

/** Euler angles (degrees, R = Rz·Ry·Rx as in sculpt edits) of the frame X, Y, Z (columns). */
export function eulerOf(x: Vec3, y: Vec3, z: Vec3): Vec3 {
  const beta = Math.asin(Math.max(-1, Math.min(1, -x[2])));
  return [Math.atan2(y[2], z[2]) * DEG, beta * DEG, Math.atan2(x[1], x[0]) * DEG];
}

/** Semi-axes [across, out, along] of a muscle's belly. Flat ellipsoids are kept ≥ 0.35 × as
 *  thick as wide and ≥ 0.15 × as long: the ellipsoid distance bound degrades with the axis ratio,
 *  and a sliver lets the mesher skip cells it crosses (a slit through the skin). */
export function bellyOf(m: FibreMuscle, definition: number): Vec3 {
  const k = m.bone ? 1 : definition;
  const width = m.width * (0.6 + 0.4 * k);
  const half = v3.len(v3.sub(m.to, m.from)) / 2;
  return [width, Math.max(m.thick * k, width * 0.35, half * 0.15), half];
}

/** One muscle as an ellipsoid edit: long axis along the fibres, its thickness along its out face. */
export function muscleEdit(m: FibreMuscle, definition: number, soft = 0): SculptEdit {
  const z = v3.norm(v3.sub(m.to, m.from));
  const y = v3.norm(v3.sub(m.out, v3.mul(z, v3.dot(m.out, z))));
  const x = v3.cross(y, z);
  const size = bellyOf(m, definition);
  return {
    shape: 'ellipsoid',
    at: v3.lerp(m.from, m.to, 0.5),
    size,
    rotate: eulerOf(x, y, z),
    // Tight (¼ of the width) but never under `soft`: a valley tighter than ~2 cm on a wolf reads
    // as two blobs glued together (QA connections), not as a muscle under skin and fur.
    blend: Math.max(0.25 * size[0], soft, m.blend ?? 0),
    kernel: 'cubic',
  };
}

const flip = (p: Vec3): Vec3 => [p[0], -p[1], p[2]];

/**
 * A muscle as the body sculpt sees it. The sculpt is mirrored by folding |y|, which creases any
 * one-sided shape crossing the midline; a muscle that reaches it (sternocephalicus, pectorals,
 * epaxials) comes with its right twin, smooth-blended, so the pair is symmetric and the fold
 * leaves no seam.
 */
export function pairedEdit(m: FibreMuscle, definition: number, soft = 0): SculptEdit {
  const e = muscleEdit(m, definition, soft);
  if (!('shape' in e) || !Array.isArray(e.size)) return e;
  const reach = Math.max(...e.size) + (e.blend ?? 0);
  if (e.at[1] > reach) return e;
  const twin = muscleEdit(
    { ...m, from: flip(m.from), to: flip(m.to), out: flip(m.out) },
    definition,
  );
  // The pair meets in a soft groove (the spine's, the throat's), three times the muscle's blend.
  const k = e.blend ?? 0;
  return { group: [e, { ...twin, blend: 3 * k }], blend: k, kernel: 'cubic' };
}

/** The muscle moved along its out face so its belly rises `rise` × thickness above `base`
 *  (marching in along −out from 1.5 × its belly size outside, so the ray cannot land on another
 *  form such as a leg); unchanged where the ray finds no surface within that reach. */
export function seat(m: FibreMuscle, base: Field, definition: number): FibreMuscle {
  const o = v3.norm(m.out);
  const c = v3.lerp(m.from, m.to, 0.5);
  const [width, thick] = bellyOf(m, definition);
  const reach = 1.5 * (width + thick);
  for (let t = reach; t > -reach; t -= 0.001) {
    const p = v3.add(c, v3.mul(o, t));
    if (base(p) < 0) {
      const d = v3.mul(o, t - thick * (1 - (m.rise ?? 0.4)));
      return { ...m, from: v3.add(m.from, d), to: v3.add(m.to, d) };
    }
  }
  return m;
}

/** Every muscle of the body as sculpt edits, seated on the `base` masses (bones only when
 *  `build.muscle` is 0). */
export function muscleEdits(b: Bones, s: CreatureSpec, base: readonly SculptEdit[]): SculptEdit[] {
  const k = muscleDefinition(s);
  const ms = trunkMuscles(b).filter((m) => m.bone || k > 0);
  if (ms.length === 0) return [];
  const f = sculptField(base, { color: [0, 0, 0] }).field;
  const fold: Field = (p) => f([p[0], Math.abs(p[1]), p[2]]);
  return ms.map((m) => pairedEdit(seat(m, fold, k), k, b.height * 0.025));
}
