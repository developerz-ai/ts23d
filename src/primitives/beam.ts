// A member between two points: girders, rods, rails, handrails, masts, tow cables, antennae.
// Square section by default; `segments` ≥ 3 makes it round (pipes, barrels, rods).

import {
  applyAffine,
  cross,
  frame,
  length,
  type Mesh,
  normalize,
  sub,
  type Vec3,
} from '../core/index.ts';
import type { StripId } from '../material/index.ts';
import { box } from './box.ts';
import { colorOf, count, invalid, positive } from './check.ts';
import { lathe } from './lathe.ts';

export interface BeamOptions {
  readonly from: Vec3;
  readonly to: Vec3;
  /** Side of a square section, or diameter of a round one. */
  readonly width: number;
  readonly height?: number;
  /** A whole number ≥ 3 for a round section; leave it out (or 0) for the square one. */
  readonly segments?: number;
  readonly color: Vec3;
  readonly strip?: StripId;
  /** Which way the section's local Y faces (roll). Default: world Z, or X for vertical beams. */
  readonly up?: Vec3;
  /** End caps; turn off for lattice members whose ends are buried in joints (−⅓ triangles). */
  readonly caps?: boolean;
}

const KEYS: Record<keyof BeamOptions, true> = {
  from: true,
  to: true,
  width: true,
  height: true,
  segments: true,
  color: true,
  strip: true,
  up: true,
  caps: true,
};

export function beam(o: BeamOptions): Mesh {
  colorOf('beam', o, KEYS);
  const dir = sub(o.to, o.from);
  const len = length(dir);
  // NaN and Infinity fail this test too: `box` would name itself, not the beam.
  if (!(len > 1e-9 && Number.isFinite(len)))
    invalid(
      `beam from [${o.from.join(', ')}] to [${o.to.join(', ')}] has no length`,
      'give the beam two distinct, finite end points in metres',
    );
  positive('beam width', o.width, 'width: 0.1');
  if (o.height !== undefined) positive('beam height', o.height, 'height: 0.2');
  // 0 reads as "square" too: a recipe picks `segments` per LOD, e.g. ctx.pick([8, 5, 0]).
  const segments =
    o.segments === undefined || o.segments === 0 ? 0 : count('beam segments', o.segments, 3, 256);
  const w = normalize(dir);
  const ref: Vec3 = o.up ?? (Math.abs(w[2]) > 0.95 ? [1, 0, 0] : [0, 0, 1]);
  const side = cross(ref, w);
  if (!(length(side) > 1e-6 * length(ref)))
    invalid(
      `beam up [${ref.join(', ')}] is zero or parallel to from → to`,
      'pass an `up` perpendicular to the beam (it sets the roll of the section)',
    );
  const u = normalize(side);
  const v = cross(w, u);
  // Local Z runs from→to, so the section is built standing on the origin.
  const local =
    segments > 0
      ? lathe({
          profile: [
            [o.width / 2, 0],
            [o.width / 2, len],
          ],
          segments,
          color: o.color,
          caps: o.caps ?? true,
          ...(o.strip ? { strip: o.strip } : {}),
        })
      : box({
          size: [o.width, o.height ?? o.width, len],
          ...(o.caps === false ? { omit: ['top', 'bottom'] as const } : {}),
          color: o.color,
          ...(o.strip ? { strip: o.strip } : {}),
        });
  return applyAffine(local, frame(u, v, w, o.from));
}
