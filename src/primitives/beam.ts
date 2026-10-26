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
import { lathe } from './lathe.ts';

export interface BeamOptions {
  readonly from: Vec3;
  readonly to: Vec3;
  /** Side of a square section, or diameter of a round one. */
  readonly width: number;
  readonly height?: number;
  readonly segments?: number;
  readonly color: Vec3;
  readonly strip?: StripId;
  /** Which way the section's local Y faces (roll). Default: world Z, or X for vertical beams. */
  readonly up?: Vec3;
  /** End caps; turn off for lattice members whose ends are buried in joints (−⅓ triangles). */
  readonly caps?: boolean;
}

export function beam(o: BeamOptions): Mesh {
  const dir = sub(o.to, o.from);
  const len = length(dir);
  const w = normalize(dir);
  const ref: Vec3 = o.up ?? (Math.abs(w[2]) > 0.95 ? [1, 0, 0] : [0, 0, 1]);
  const u = normalize(cross(ref, w));
  const v = cross(w, u);
  // Local Z runs from→to, so the section is built standing on the origin.
  const local =
    o.segments && o.segments >= 3
      ? lathe({
          profile: [
            [o.width / 2, 0],
            [o.width / 2, len],
          ],
          segments: o.segments,
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
