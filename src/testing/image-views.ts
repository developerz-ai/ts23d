// The six axis views the image assertions render silhouettes from (camera looking along `dir`,
// Z up), by name, so tests can say `'+X'` (front) or `'-Z'` (from below) instead of vectors.

import type { Vec3 } from '../core/index.ts';

/** A camera direction (same shape as the render module's views). */
export interface View {
  readonly label: string;
  /** Direction the camera looks along (world, Z up). */
  readonly dir: Vec3;
  readonly up: Vec3;
}

export type AxisView = '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z';

/** The camera sits on the named side looking back at the asset (+X = from the front). */
export const AXIS_VIEWS: Readonly<Record<AxisView, View>> = {
  '+X': { label: 'FRONT +X', dir: [-1, 0, 0], up: [0, 0, 1] },
  '-X': { label: 'REAR -X', dir: [1, 0, 0], up: [0, 0, 1] },
  '+Y': { label: 'LEFT +Y', dir: [0, -1, 0], up: [0, 0, 1] },
  '-Y': { label: 'RIGHT -Y', dir: [0, 1, 0], up: [0, 0, 1] },
  '+Z': { label: 'TOP +Z', dir: [0, 0, -1], up: [1, 0, 0] },
  '-Z': { label: 'BOTTOM -Z', dir: [0, 0, 1], up: [1, 0, 0] },
};

export const ALL_AXIS_VIEWS: readonly AxisView[] = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];

export const viewOf = (v: AxisView | View): View => (typeof v === 'string' ? AXIS_VIEWS[v] : v);
