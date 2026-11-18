// How far a perspective camera must stand to see a whole sphere, in either screen direction.

/** Distance for `radius` at vertical field of view `fovDeg` (degrees) and width ÷ height `aspect`. */
export function sphereDistance(radius: number, fovDeg: number, aspect: number): number {
  const vertical = (fovDeg * Math.PI) / 360;
  const horizontal = Math.atan(Math.tan(vertical) * aspect);
  return radius / Math.sin(Math.min(vertical, horizontal));
}
