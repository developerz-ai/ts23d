// How far a perspective camera must stand to see a whole sphere, in either screen direction.

/** Distance for `radius` at vertical field of view `fovDeg` (degrees) and width ÷ height `aspect`. */
import { dmath } from '@developerz.ai/ts23d/core';

export function sphereDistance(radius: number, fovDeg: number, aspect: number): number {
  const vertical = (fovDeg * Math.PI) / 360;
  const horizontal = dmath.atan(dmath.tan(vertical) * aspect);
  return radius / dmath.sin(Math.min(vertical, horizontal));
}
