// Biology checks for Cinderhorn: the numbers README.md argues from, computed from the model so
// they cannot drift. Mass from volume × flesh density (~1000 kg/m³, the `plain` strip's density),
// limb strength from the Campione & Evans (2012) quadruped scaling of humerus + femur
// circumference, and wing area / wing loading from the membrane mesh.
// Sources: Campione & Evans, BMC Biology 10:60 (2012), https://doi.org/10.1186/1741-7007-10-60 ;
// Witton & Habib, PLoS ONE 5(11) e13982 (2010), https://doi.org/10.1371/journal.pone.0013982
// (giant pterosaur wing loadings).

import { type CompiledAsset, type Mesh, massProperties, worldMeshes } from '@developerz.ai/ts23d';

/** Bone diameter as a fraction of the limb's flesh diameter (stylised beast; stated assumption). */
export const BONE_FRACTION = 0.4;
/** Flesh radii at the humerus and femur midshafts (legs.ts chains), metres. */
export const HUMERUS_FLESH_R = 0.25;
export const FEMUR_FLESH_R = 0.25;

/** One-face area of a closed thin shell (a membrane): half its surface area. */
export function sheetArea(m: Mesh): number {
  let a = 0;
  const P = m.positions;
  const I = m.indices;
  for (let t = 0; t < I.length; t += 3) {
    const i = (I[t] ?? 0) * 3;
    const j = (I[t + 1] ?? 0) * 3;
    const k = (I[t + 2] ?? 0) * 3;
    const ux = (P[j] ?? 0) - (P[i] ?? 0);
    const uy = (P[j + 1] ?? 0) - (P[i + 1] ?? 0);
    const uz = (P[j + 2] ?? 0) - (P[i + 2] ?? 0);
    const vx = (P[k] ?? 0) - (P[i] ?? 0);
    const vy = (P[k + 1] ?? 0) - (P[i + 1] ?? 0);
    const vz = (P[k + 2] ?? 0) - (P[i + 2] ?? 0);
    a += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  }
  return a / 2;
}

/** Campione & Evans 2012: quadruped body mass (kg) from humerus + femur circumference (mm). */
export const massFromLimbs = (circumferenceMm: number): number =>
  10 ** (2.749 * Math.log10(circumferenceMm) - 1.104) / 1000;

export interface Biology {
  /** kg, volume × density of the compiled asset. */
  readonly mass: number;
  /** m², both wings (one face of each membrane). */
  readonly wingArea: number;
  /** N/m². */
  readonly wingLoading: number;
  /** Humerus + femur bone circumference, mm (flesh radius × BONE_FRACTION). */
  readonly limbCircumference: number;
  /** Mass those limbs could carry (Campione & Evans) ÷ actual mass: ≥ 1 = legs strong enough. */
  readonly limbSafety: number;
}

export function biology(asset: CompiledAsset): Biology {
  const mass = massProperties(asset).computedMass;
  const w = worldMeshes(asset.parts);
  const wingArea = ['wing_l_membrane', 'wing_r_membrane'].reduce((s, n) => {
    const m = w.get(n);
    return s + (m ? sheetArea(m) : 0);
  }, 0);
  const bone = (r: number): number => 2 * Math.PI * r * BONE_FRACTION * 1000;
  const limbCircumference = bone(HUMERUS_FLESH_R) + bone(FEMUR_FLESH_R);
  return {
    mass,
    wingArea,
    wingLoading: (mass * 9.81) / Math.max(wingArea, 1e-6),
    limbCircumference,
    limbSafety: massFromLimbs(limbCircumference) / mass,
  };
}
