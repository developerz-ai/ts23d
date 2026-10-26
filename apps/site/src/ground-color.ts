// Ground colouring shared by the play terrain and the viewer's diorama base: grass, drier grass up
// high, bare earth on steep slopes, darker dirt where vehicles run.

import { hex, type Vec3 } from '@developerz-ai/ts23d';
import { mix3, smoothstep, valueNoise } from './noise.ts';

const GRASS = hex('#566f33');
const DRY = hex('#8a8150');
const EARTH = hex('#6e5638');
const DIRT = hex('#463627');

export type Height = (x: number, y: number) => number;

/** Rise per metre at (x, y), by central differences. */
export function slopeAt(h: Height, x: number, y: number, d = 1): number {
  return Math.hypot(h(x + d, y) - h(x - d, y), h(x, y + d) - h(x, y - d)) / (2 * d);
}

/** Colour for a ground point. `dirt` is 0..1 track wear; `dryAt` the height where grass browns. */
export function groundColor(
  h: Height,
  x: number,
  y: number,
  z: number,
  dirt: number,
  dryAt = 8,
): Vec3 {
  let c = mix3(GRASS, DRY, smoothstep(dryAt * 0.4, dryAt * 1.4, z));
  c = mix3(c, EARTH, smoothstep(0.22, 0.55, slopeAt(h, x, y)));
  c = mix3(c, DIRT, dirt);
  // Patchiness so flat ground doesn't read as a single fill.
  const k = 0.88 + 0.12 * valueNoise(x / 3.5, y / 3.5, 77);
  return [c[0] * k, c[1] * k, c[2] * k];
}
