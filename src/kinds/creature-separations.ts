// Separations between muscles as crease strokes (LOD0): the grooves an artist cuts after the
// masses are in — behind the triceps (its caudal border over the ribs), between biceps femoris
// and semitendinosus down the back of the thigh, and the flank fold where the thigh leaves the
// belly. Each path is projected onto the sculpt built so far (marching in along −Y onto the left
// side), so a groove follows the real surface whatever the muscles did.

import type { Vec3 } from '../core/index.ts';
import { type SculptEdit, type SculptStroke, sculptField } from '../primitives/index.ts';
import type { Bones } from './creature-bones.ts';
import { v3 } from './creature-curve.ts';
import { trunkMuscles } from './creature-muscle-map.ts';

/** The point on the left surface at (x, z), marching in from far out along −Y; null if none. */
function onSurface(f: (p: Vec3) => number, x: number, z: number, far: number): Vec3 | null {
  const step = far / 400;
  for (let y = far; y > 0; y -= step) if (f([x, y, z]) < 0) return [x, y + step / 2, z];
  return null;
}

export function separations(b: Bones, before: readonly SculptEdit[]): SculptStroke[] {
  const m = new Map(trunkMuscles(b).map((q) => [q.name, q]));
  const tri = m.get('triceps_long');
  const bic = m.get('biceps_femoris');
  const semi = m.get('semitendinosus');
  const hind = b.legs.find((l) => l.name === 'hind');
  const K = hind?.joints[1];
  const belly = b.trunk[1];
  if (!tri || !bic || !semi || !K || !belly || before.length === 0) return [];
  const f = sculptField(before, { color: [0, 0, 0] }).field;
  const far = b.height;
  const r = b.limbR;
  const groove = (
    pts: readonly Vec3[],
    radius: readonly [number, number],
    depth: number,
  ): SculptStroke | null => {
    const path = pts.map((p) => onSurface(f, p[0], p[2], far)).filter((p): p is Vec3 => p !== null);
    return path.length >= 2 ? { stroke: 'crease', path, radius, depth } : null;
  };
  // Caudal border of the triceps: behind its belly, from the scapula's caudal angle to the elbow.
  const back = (t: number): Vec3 => v3.add(v3.lerp(tri.from, tri.to, t), [-tri.width * 0.9, 0, 0]);
  // Between biceps femoris (lateral) and semitendinosus (caudal): down the back of the thigh.
  const seam = (t: number): Vec3 =>
    v3.lerp(v3.lerp(bic.from, semi.from, 0.5), v3.lerp(bic.to, semi.to, 0.5), t);
  // Flank fold: from the front of the stifle up and forward to the belly floor.
  const floor = belly.at[2] - belly.r[2] * 0.7;
  const flank = [
    v3.add(K, [r * 0.9, 0, r * 0.8]),
    [K[0] + r * 1.6, K[1], (K[2] + floor) / 2],
    [K[0] + r * 2.4, K[1], floor],
  ] as Vec3[];
  return [
    groove([back(0.35), back(0.6), back(0.85)], [r * 0.3, r * 0.55], r * 0.08),
    groove([seam(0.35), seam(0.55), seam(0.75)], [r * 0.2, r * 0.5], r * 0.06),
    groove(flank, [r * 0.6, r * 0.3], r * 0.06),
  ].filter((g): g is SculptStroke => g !== null);
}
