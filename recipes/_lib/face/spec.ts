// The face recipe as numbers: a race preset is a FaceSpec of ratios against the measured human
// base (1 = the base, ΔH = a shift in head heights H, the menton → crown distance), and a
// Character adds the per-person knobs (age, weight, seeded asymmetry) and the look (skin, eyes,
// hair). `HUMAN` is the identity: every warp of it is the base itself.

import type { Vec3 } from '@developerz.ai/ts23d';

export interface FaceSpec {
  /** Head size × the base's (H = 0.2336 m). Applied to the whole bust. */
  readonly scale: number;
  /** Cranium width / vault height / depth behind the ears, × base. */
  readonly cranium: { readonly width: number; readonly height: number; readonly depth: number };
  /** Brow ridge pushed forward / raised, ΔH. */
  readonly brow: { readonly forward: number; readonly height: number };
  /** Eye spacing ×, outer-corner tilt ΔH (+ lifts it: almond), lid opening ×. */
  readonly eyes: { readonly spacing: number; readonly tilt: number; readonly open: number };
  /** Nose: ala width ×, tip projection ×, length ×, bridge height ΔH, tip hook ΔH (down). */
  readonly nose: {
    readonly width: number;
    readonly projection: number;
    readonly length: number;
    readonly bridge: number;
    readonly hook: number;
  };
  /** Cheekbones: width ×, height ΔH, forward ΔH. */
  readonly zygoma: { readonly width: number; readonly height: number; readonly forward: number };
  /** Jaw: bigonial width ×, chin drop ΔH. Chin forward ΔH (− recedes), chin width ×. */
  readonly jaw: { readonly width: number; readonly drop: number };
  readonly chin: { readonly forward: number; readonly width: number };
  /** Mouth width ×, lip fullness ΔH, lower lip ahead of the upper (underbite) ΔH. */
  readonly mouth: { readonly width: number; readonly lips: number; readonly underbite: number };
  /** Nasion → menton length ×. */
  readonly face: number;
  /** Ear length ×, tip pull (ΔH: back, out, up), whole ear swung out from the head, degrees. */
  readonly ears: { readonly length: number; readonly tip: Vec3; readonly out: number };
  /** Neck width ×, trapezius rise ΔH, shoulder width ×. */
  readonly body: { readonly neck: number; readonly traps: number; readonly shoulders: number };
}

export const HUMAN: FaceSpec = {
  scale: 1,
  cranium: { width: 1, height: 1, depth: 1 },
  brow: { forward: 0, height: 0 },
  eyes: { spacing: 1, tilt: 0, open: 1 },
  nose: { width: 1, projection: 1, length: 1, bridge: 0, hook: 0 },
  zygoma: { width: 1, height: 0, forward: 0 },
  jaw: { width: 1, drop: 0 },
  chin: { forward: 0, width: 1 },
  mouth: { width: 1, lips: 0, underbite: 0 },
  face: 1,
  ears: { length: 1, tip: [0, 0, 0], out: 0 },
  body: { neck: 1, traps: 0, shoulders: 1 },
};

/** Skin painter's palette (linear-ish sRGB 0..1). */
export interface SkinTone {
  readonly base: Vec3;
  /** Blood-warm zones: lips, nose tip, cheeks, ears. */
  readonly flush: Vec3;
  readonly lips: Vec3;
  /** Cool zones: eye sockets, jaw shadow. */
  readonly cool: Vec3;
  readonly cavity: Vec3;
}

export interface Character {
  readonly race: FaceSpec;
  /** 0 young adult … 1 old: sag, longer nose and ears, thinner lips, heavier lids. */
  readonly age: number;
  /** −1 lean … +1 heavy: cheek and jaw fat, neck. */
  readonly weight: number;
  /** 0 … 1: seeded per-landmark asymmetry (≤ 1.2 % H at 1). */
  readonly asym: number;
  readonly tone: SkinTone;
  readonly eyes: { readonly iris: Vec3; readonly pupil?: 'round' | 'slit'; readonly sclera?: Vec3 };
  /** Lips: 1 = parted as on the base, 0 = closed (default 1). */
  readonly mouth?: number;
  /** Tusks from the lower jaw (orc), length ΔH. */
  readonly tusks?: number;
}
