// The `build` knobs of a creature spec: what a recipe says about the body beyond its three sourced
// sizes — chest section, limb thickness, the waist, the ruff, where the hind feet stand, how wide
// the stance is, and control points that raise the topline (a bear's shoulder hump, a bison's).
// Each knob refuses nonsense with T3D_RECIPE_INVALID before any sculpting happens.

import { Ts23dError } from '../core/index.ts';

/** A raised point on the back: a muscle or fat mass standing over the dorsal line. */
export interface ToplinePoint {
  /** Where along the back: 0 = the croup (over the hips), 1 = the withers. */
  readonly at: number;
  /** Height above the plain topline there ÷ shoulder height (a brown bear's hump ≈ 0.06–0.1). */
  readonly rise: number;
  /** Length of the mass along the back ÷ trunk length (default 0.3). */
  readonly span?: number;
  /** Width of the mass ÷ chest width (default 0.6). */
  readonly width?: number;
}

export interface CreatureBuild {
  /** Chest depth ÷ shoulder height (default 0.45). */
  readonly depth?: number;
  /** Chest width ÷ chest depth (default 0.62). */
  readonly width?: number;
  /** Limb thickness × the allometric default (1 = Campione & Evans for the mass). */
  readonly limbs?: number;
  /** Tail girth × the default (a bushy wolf tail ≈ 1.6). */
  readonly tailGirth?: number;
  /** Long fur on the nape, throat and chest (a ruff), metres (default 0). */
  readonly ruff?: number;
  /** Abdomen depth at the flank ÷ chest depth: the waist tuck-up (default 0.72; greyhound ≈ 0.4). */
  readonly tuck?: number;
  /** Muscle definition 0..1: scales the fibre muscles' bellies (creature-muscles.ts; default per
   *  family, lean canid 0.85). 0 = smooth masses only. */
  readonly muscle?: number;
  /** Hock (plantigrade: heel) height ÷ shoulder height: the length of the hind cannon. Default
   *  per stance (digitigrade 0.28, plantigrade 0.06, unguligrade 0.36). */
  readonly hock?: number;
  /** How far the hock (plantigrade: the heel) stands behind the hip ÷ trunk length (default
   *  0.13: a dog standing stretched). 0 = under the hip: a bear standing square on its soles. */
  readonly heel?: number;
  /** Leg centres off the midline ÷ chest width (default 0.34). Thick limbs widen the stance by
   *  their own radius; lower this to hold a sourced width. */
  readonly track?: number;
  /** Raised masses on the back, croup → withers (default none: withers, dip, croup only). */
  readonly topline?: readonly ToplinePoint[];
}

const bad = (cause: string, fix: string): never => {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause: `creature: ${cause}`, fix });
};

const ratio = (v: number | undefined, lo: number, hi: number, name: string): void => {
  if (v !== undefined && !(v >= lo && v <= hi))
    bad(`${name} is ${v}, outside ${lo}..${hi}`, `give ${name} a ratio between ${lo} and ${hi}`);
};

/** Validates the build knobs; throws T3D_RECIPE_INVALID naming the field and the fix. */
export function checkBuild(b: CreatureBuild | undefined): void {
  ratio(b?.depth, 0.2, 0.8, 'build.depth');
  ratio(b?.width, 0.3, 1.5, 'build.width');
  ratio(b?.limbs, 0.2, 4, 'build.limbs');
  ratio(b?.tailGirth, 0.2, 4, 'build.tailGirth');
  ratio(b?.tuck, 0.3, 1, 'build.tuck');
  ratio(b?.muscle, 0, 1, 'build.muscle');
  ratio(b?.hock, 0.03, 0.5, 'build.hock');
  ratio(b?.heel, -0.05, 0.25, 'build.heel');
  ratio(b?.track, 0.15, 0.5, 'build.track');
  (b?.topline ?? []).forEach((p, i) => {
    ratio(p.at, 0, 1, `build.topline[${i}].at`);
    ratio(p.rise, 0.005, 0.2, `build.topline[${i}].rise`);
    ratio(p.span, 0.1, 0.8, `build.topline[${i}].span`);
    ratio(p.width, 0.2, 1, `build.topline[${i}].width`);
  });
}
