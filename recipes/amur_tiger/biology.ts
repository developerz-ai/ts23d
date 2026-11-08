// Biology checks for the tiger, computed from the model so they cannot drift from it: head + body
// length nose → tail root, tail length, the union volume of the body sculpt (voxelised from its
// field, so overlapping edits are never counted twice — the D22 cross-check of the mass gate),
// the furred-body density (flesh under a coat shell) the mass gate uses, and limb allometry: Campione & Evans (2012) quadruped body mass from humerus + femur
// circumference, with the bone taken as a stated fraction of the limb's flesh width.
// Sources: Campione & Evans, BMC Biology 10:60 (2012), https://doi.org/10.1186/1741-7007-10-60

import type { Field, Vec3 } from '@developerz.ai/ts23d';
import { v3 } from '../_lib/creature/curve.ts';
import { hit } from '../_lib/creature/probe.ts';
import { HEAD, headToWorld, SK } from './skeleton.ts';
import { tailLength } from './tail.ts';

/** Bone diameter ÷ furred limb width at the humerus / femur midshaft. Assumption, not sourced: a
 *  big cat's humerus is ~3.5–4 cm across under ~18–20 cm of shoulder muscle and winter coat. */
export const BONE_FRACTION = 0.2;

/** Body density of a mammal (muscle ≈ 1060, fat ≈ 900, bone ≈ 1900; whole body ≈ 1050 kg/m³). */
export const FLESH_DENSITY = 1050;
/** The sculpted surface is the coat, not the skin: winter hair is 40–50 mm on the back, 60–110
 *  on nape, throat, chest and belly, shorter on legs and face (Geptner & Sludskij 1972); lying
 *  flat it stands an effective ~2 cm off the skin over the whole surface (assumption). */
export const COAT_DEPTH = 0.02;
/** Hair (keratin ≈ 1300 kg/m³) packed at ~8% in trapped air (assumption). */
export const COAT_DENSITY = 100;
/** Surface ÷ volume of the compiled tiger, m⁻¹ (measured on LOD0/LOD1: 14.6 / 14.4; held by the test). */
export const AREA_PER_VOLUME = 14.5;
/** The density the mass gate fills the furred volume with: flesh inside, coat in the outer shell. */
export const EFFECTIVE_DENSITY = Math.round(
  FLESH_DENSITY - (FLESH_DENSITY - COAT_DENSITY) * COAT_DEPTH * AREA_PER_VOLUME,
);

/** Campione & Evans 2012: quadruped body mass (kg) from humerus + femur circumference (mm). */
export const massFromLimbs = (circumferenceMm: number): number =>
  10 ** (2.749 * Math.log10(circumferenceMm) - 1.104) / 1000;

/** Straight line nose tip → tail root (the "head and body length" of Kerley et al. 2005). */
export function headBodyLength(): number {
  return v3.len(v3.sub(headToWorld(HEAD.nose), SK.tailRoot));
}

export { tailLength };

/** Union volume (m³) of a field over a box, by voxel occupancy at `h` metres. */
export function fieldVolume(f: Field, lo: Vec3, hi: Vec3, h: number): number {
  let n = 0;
  for (let x = lo[0] + h / 2; x < hi[0]; x += h)
    for (let y = lo[1] + h / 2; y < hi[1]; y += h)
      for (let z = lo[2] + h / 2; z < hi[2]; z += h) if (f([x, y, z]) < 0) n++;
  return n * h ** 3;
}

export interface Allometry {
  /** Humerus + femur circumference (mm) from the flesh widths × BONE_FRACTION. */
  readonly circumference: number;
  /** Body mass those limbs carry (Campione & Evans), kg. */
  readonly mass: number;
}

export function allometry(f: Field): Allometry {
  const mid = (a: Vec3, b: Vec3): Vec3 => v3.lerp(a, b, 0.5);
  // Probe just outside the trunk: the outer half-width ×2 (the inner side meets the body).
  const half = (at: Vec3): number => {
    const out = hit((p) => -f(p), at, [0, 1, 0], 0.3, 0.002);
    return 2 * ((out ? out[1] : at[1]) - at[1]);
  };
  const hum = half(mid(SK.fore.shoulder, SK.fore.elbow));
  const fem = half(mid(SK.hind.hip, SK.hind.knee));
  const c = Math.PI * BONE_FRACTION * (hum + fem) * 1000;
  return { circumference: c, mass: massFromLimbs(c) };
}
