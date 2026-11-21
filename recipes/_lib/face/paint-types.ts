// The skin painter's options (./paint.ts): what life has done to a skin and how to paint it.

import type { Rng, Vec3 } from '@developerz.ai/ts23d';
import type { SkinTone } from './spec.ts';

/** What life has done to a skin, painted on top of its zones. All dials 0..1. */
export interface SkinWear {
  /** Sun on the skin that faces up and forward: darker, warmer forehead, nose, cheek tops,
   *  shoulders; freckles gather there. */
  readonly sun: number;
  /** Uneven colour: redder and paler blotches. */
  readonly freckles: number;
  /** Dirt in the hollows and on the neck. */
  readonly grime: number;
  /** Wind- or forge-reddened skin over the cheekbones and the nose, 0 … 1 (default 0). */
  readonly wind?: number;
  /** Shaven-beard shadow: where the beard would grow, its colour, how strong. */
  readonly stubble?: {
    readonly region: (p: Vec3) => number;
    readonly colour: Vec3;
    readonly amount: number;
    /** Share of `colour` laid under the hairs at full strength (default 0.7: the dark skin
     *  under a full beard). A shaven beard's dots are the stubble strip's; its wash is faint. */
    readonly wash?: number;
    /** The ramp from outside the line inward, in head-scale metres (default 0.009). */
    readonly feather?: number;
  };
  /** Healed cuts, as segments in bust space: a pale ridge with a darker rim. */
  readonly scars?: readonly { readonly a: Vec3; readonly b: Vec3; readonly width: number }[];
}

export interface PaintOptions {
  readonly tone: SkinTone;
  readonly brows: Vec3;
  readonly rng: Rng;
  /** Hairline region (≤ 0 where hair grows): the skin under its edge takes the hair colour, so
   *  the hair grows out of a soft line instead of sitting on the skin like a cap. */
  readonly hairline?: (p: Vec3) => number;
  readonly hair?: Vec3;
  /** 0 young … 1 old: darker under the eyes, forehead lines, deeper folds beside the mouth. */
  readonly age?: number;
  readonly wear?: SkinWear;
  /** Seeded marks (moles, warts): a spot of `colour` × the skin under it, radius `r`. */
  readonly marks?: readonly { readonly at: Vec3; readonly r: number; readonly tone: number }[];
  /** The far LOD: the zones only (lips, brows, sockets, flush, beard, hairline). Noise-driven
   *  colour (mottle, blotches, grit, curvature) on a 1 000-triangle face is a patchwork. */
  readonly far?: boolean;
}
