// The portrait camera of a bust: a fixed viewpoint (the `hero` hint of an asset) in which the face
// fills the frame. The default orbit frames an asset's bounding sphere, which leaves a bust (wide
// shoulders, small head, a plinth) at about 60 % of the image height and its face a few dozen
// pixels wide; a whole-bust framing still spent half the image on the plinth and the chest cut.
// Here the camera frames the head and shoulders (the crown at the top, the upper chest at the
// bottom), from the front-left 3/4 a little above eye level, the way a portrait photographer
// would: the eyes a third down the frame.

import type { HeroView } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';

export interface Portrait {
  /** Camera orbit from the front (+X), degrees (default −34: front-left 3/4). */
  readonly azDeg?: number;
  /** Elevation, degrees (default 6: just above eye level). */
  readonly elDeg?: number;
  /** The asset's height over the image height (default 1.2: the top 80 % of the asset, crown to
   *  upper chest, fills the frame). */
  readonly fill?: number;
  /** Where the camera looks: metres ahead of the plinth's axis and height as a share of the
   *  asset's (defaults 0.03, 0.66: the face's lower half, so the crown keeps a margin). */
  readonly ahead?: number;
  readonly at?: number;
}

const FOV = 24;

/** The hero view for a bust `height` metres tall standing on the origin. */
export function portrait(height: number, o: Portrait = {}): HeroView {
  const az = ((o.azDeg ?? -34) * Math.PI) / 180;
  const el = ((o.elDeg ?? 6) * Math.PI) / 180;
  const target: [number, number, number] = [o.ahead ?? 0.03, 0, height * (o.at ?? 0.66)];
  const d = height / (o.fill ?? 1.2) / 2 / dmath.tan((FOV * Math.PI) / 360);
  const r = (v: number): number => Math.round(v * 1e4) / 1e4;
  return {
    eye: [
      r(target[0] + d * dmath.cos(el) * dmath.cos(az)),
      r(target[1] + d * dmath.cos(el) * dmath.sin(az)),
      r(target[2] + d * dmath.sin(el)),
    ],
    target,
    fovDeg: FOV,
  };
}
