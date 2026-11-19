// The portrait camera of a bust: a fixed viewpoint (the `hero` hint of an asset) that fills the
// frame with it. The default orbit frames an asset's bounding sphere, which leaves a bust (wide
// shoulders, small head) at about 60 % of the image height and its face a few dozen pixels wide;
// here the plinth's foot and the crown sit `fill` of the height apart instead, seen from the
// front-left 3/4 a little above eye level.

import type { HeroView } from '@developerz.ai/ts23d';

export interface Portrait {
  /** Camera orbit from the front (+X), degrees (default −32: front-left 3/4). */
  readonly azDeg?: number;
  /** Elevation, degrees (default 10). */
  readonly elDeg?: number;
  /** Share of the image height the asset's height takes (default 0.88). */
  readonly fill?: number;
  /** Where the camera looks: metres ahead of the plinth's axis and height as a share of the
   *  asset's (defaults 0.02, 0.52). */
  readonly ahead?: number;
  readonly at?: number;
}

const FOV = 24;

/** The hero view for a bust `height` metres tall standing on the origin. */
export function portrait(height: number, o: Portrait = {}): HeroView {
  const az = ((o.azDeg ?? -32) * Math.PI) / 180;
  const el = ((o.elDeg ?? 10) * Math.PI) / 180;
  const target: [number, number, number] = [o.ahead ?? 0.02, 0, height * (o.at ?? 0.52)];
  const d = height / (o.fill ?? 0.88) / 2 / Math.tan((FOV * Math.PI) / 360);
  const r = (v: number): number => Math.round(v * 1e4) / 1e4;
  return {
    eye: [
      r(target[0] + d * Math.cos(el) * Math.cos(az)),
      r(target[1] + d * Math.cos(el) * Math.sin(az)),
      r(target[2] + d * Math.sin(el)),
    ],
    target,
    fovDeg: FOV,
  };
}
