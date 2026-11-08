// The stand-in scan's head: the committed CC0 MakeHuman hm08 base mesh (recipes/_lib/face/base,
// data only — no warp, so the scan's bytes never move when the face library is tuned), one
// Catmull–Clark level, a simple skin paint from a few hm08 landmarks (copied here as data), sawn
// off through the lower neck and clear of the trapezius the way a head scan ends, and registered
// onto the human bust's torso: the scan's menton on the bust's menton. Its hair is a cropped cut
// in the scan's colour (as a scanner records short hair), not geometry.

import type { Mesh, Vec3 } from '@developerz.ai/ts23d';
import { L } from '../_lib/bust/human/spec.ts';
import { faceBase } from '../_lib/face/base.ts';
import { quadToMesh, subdivide } from '../_lib/face/quad.ts';

/** hm08 landmarks this file and build.ts use (metres, Z up, +X front; left side +y). */
export const HM08 = {
  menton: [0.1231, 0, 0.6155],
  labraleSup: [0.1602, 0, 0.6683],
  labraleInf: [0.1566, 0, 0.6556],
  pronasale: [0.1681, 0, 0.6909],
  eye: [0.1245, 0.0308, 0.7284],
  brow: [0.1424, 0.0338, 0.7541],
  browOuter: [0.1285, 0.0515, 0.7546],
  cheek: [0.1362, 0.0441, 0.6919],
  earOut: [0.0375, 0.0879, 0.7241],
  centre: [0.05, 0, 0.73],
} as const satisfies Record<string, Vec3>;

const TONE = {
  base: [0.56, 0.37, 0.27],
  flush: [0.62, 0.34, 0.29],
  lips: [0.5, 0.27, 0.25],
  brow: [0.16, 0.11, 0.08],
  scalp: [0.045, 0.032, 0.022],
} as const satisfies Record<string, Vec3>;

/** hm08 frame → bust frame: a translation, menton onto the bust's menton. */
export const OFFSET: Vec3 = [L.menton[0] - HM08.menton[0], 0, L.menton[2] - HM08.menton[2]];
export const toBust = (p: Vec3): Vec3 => [p[0] + OFFSET[0], p[1] + OFFSET[1], p[2] + OFFSET[2]];

/** The collar plane z + 0.3 x = SEAM_Z (bust frame, higher at the back like the bust seam). */
export const SEAM_Z = 0.28;

function keep(p: Vec3): boolean {
  const q = toBust(p);
  // 2 cm below the collar plane (hidden in the torso), and off the trapezius.
  const belowSeam = q[2] + 0.3 * q[0] < SEAM_Z - 0.02;
  // Trapezius flare trimmed only under the collar (never where it can be seen).
  const shoulder = Math.hypot(p[0] - 0.03, p[1]) > 0.062 && q[2] + 0.3 * q[0] < SEAM_Z - 0.006;
  return !belowSeam && !shoulder;
}

const near = (p: Vec3, c: readonly number[], r: number): number => {
  const d = Math.hypot(p[0] - (c[0] ?? 0), Math.abs(p[1]) - (c[1] ?? 0), p[2] - (c[2] ?? 0));
  return Math.max(0, 1 - d / r) ** 2;
};
const mix = (a: readonly number[], b: readonly number[], t: number): Vec3 => [
  (a[0] ?? 0) + ((b[0] ?? 0) - (a[0] ?? 0)) * t,
  (a[1] ?? 0) + ((b[1] ?? 0) - (a[1] ?? 0)) * t,
  (a[2] ?? 0) + ((b[2] ?? 0) - (a[2] ?? 0)) * t,
];

/** Deterministic grain in −1..1 on a 1.5 mm lattice (strands, mottle). */
function grain(p: Vec3): number {
  let h = Math.imul(Math.floor(p[0] * 660) | 0, 73856093);
  h ^= Math.imul(Math.floor(Math.abs(p[1]) * 660) | 0, 19349663);
  h ^= Math.imul(Math.floor(p[2] * 330) | 0, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967295) * 2 - 1;
}

/** Skin colour at an hm08 point: flush on cheeks, nose and ears, lips, brows, shaved scalp. */
export function skinColour(p: Vec3): Vec3 {
  let c = mix(
    TONE.base,
    TONE.flush,
    Math.min(
      1,
      near(p, HM08.cheek, 0.03) + near(p, HM08.pronasale, 0.018) + near(p, HM08.earOut, 0.025),
    ),
  );
  const lips = Math.max(near(p, HM08.labraleSup, 0.012), near(p, HM08.labraleInf, 0.012));
  c = mix(c, TONE.lips, Math.min(1, lips * 2.2));
  // Brows: a thin arch along brow → browOuter, just above the orbit.
  const bt = Math.max(0, Math.min(1, (Math.abs(p[1]) - 0.012) / (HM08.browOuter[1] - 0.012)));
  const bz = HM08.brow[2] + 0.004 + (HM08.browOuter[2] - HM08.brow[2]) * bt - 0.006 * bt * bt;
  const onBrow =
    Math.abs(p[2] - bz) < 0.0035 && Math.abs(p[1]) > 0.011 && Math.abs(p[1]) < 0.056 && p[0] > 0.11;
  c = mix(c, TONE.brow, onBrow ? 0.75 : 0);
  // Above the hairline the scan saw cropped hair: high on the forehead, over the ears, low at the
  // nape (the code-built hair covers the same ground at LOD0/1; LOD2 shows only this).
  const t = Math.max(0, Math.min(1, (p[0] + 0.04) / 0.17));
  const ear = near(p, [0.045, 0.08, 0.72], 0.035);
  const line = 0.655 + 0.135 * t * t * (3 - 2 * t) + 0.05 * ear;
  // Hair: dark roots, lighter tips in fine strands (a hash of the position at 1.5 mm).
  const g = grain(p);
  const hairC = mix(TONE.scalp, [0.11, 0.075, 0.048], 0.5 + 0.5 * g);
  c = mix(c, hairC, Math.max(0, Math.min(1, (p[2] - line) / 0.006 + 0.3 * g)) * 0.95);
  return c;
}

/** Skin surface, painted, cut, in the bust frame; UVs left at 0 (scan.ts lays them out). */
export function sitterSkin(): Mesh {
  const qm = subdivide(faceBase().mesh);
  const q = qm.q.filter((_, i, a) => {
    const f = i - (i % 4);
    for (let k = 0; k < 4; k++) {
      const v = (a[f + k] ?? 0) * 3;
      if (!keep([qm.p[v] ?? 0, qm.p[v + 1] ?? 0, qm.p[v + 2] ?? 0])) return false;
    }
    return true;
  });
  const m = quadToMesh(
    { p: qm.p, q },
    (_v, p) => skinColour(p),
    () => [0, 0],
  );
  const positions = new Float32Array(m.positions.length);
  for (let i = 0; i < positions.length; i += 3)
    positions.set(
      toBust([m.positions[i] ?? 0, m.positions[i + 1] ?? 0, m.positions[i + 2] ?? 0]),
      i,
    );
  return { ...m, positions };
}

/** Head centre in the bust frame (the lat-long UV axis runs through it). */
export const headCentre = (): Vec3 => toBust(HM08.centre);
