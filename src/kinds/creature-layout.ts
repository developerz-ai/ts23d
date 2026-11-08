// Shared layout maths for the skeleton builders: the sizes every type derives from the spec
// (head, neck, tail lengths, allometric limb radius, head pitch), the posed tail chain, and the
// area of a wing membrane outline.

import type { Vec3 } from '../core/index.ts';
import { allometricLimbR, type Bones } from './creature-bones.ts';
import { v3 } from './creature-curve.ts';
import { tube } from './creature-skin.ts';
import { ANATOMY, type CreatureSpec, faceOf } from './creature-spec.ts';

const deg = Math.PI / 180;

/** Common sizes every type derives from the spec. */
export function sizes(s: CreatureSpec) {
  const a = ANATOMY[s.skeleton];
  const L = s.length;
  const face = faceOf(s);
  const headLen = s.head ?? a.head * L;
  return {
    L,
    H: s.height,
    stance: s.stance ?? a.stance,
    headLen,
    headWidth: headLen * face.width,
    neckLen: s.neck ?? a.neck * L,
    tailLen: s.tail ?? a.tail * L,
    limbR: allometricLimbR(s.mass) * (s.build?.limbs ?? 1),
    pitch: (s.pose?.head ?? 15) * deg,
  };
}

/** The tail chain from its root, posed: hanging J, level, or raised. `bushy` (0..1) blends the
 *  bare taper into a winter brush: slim at the root, fullest past the middle, a pointed tip. */
export function tailChain(
  root: Vec3,
  len: number,
  r0: number,
  pose: string,
  bushy = 0,
): Bones['tail'] {
  const pts: Vec3[] = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const ang =
      pose === 'up'
        ? (35 - 120 * t) * deg
        : pose === 'level'
          ? (-15 - 10 * t) * deg
          : (-55 - 30 * t + bushy * (10 * t - 11)) * deg;
    const prev = pts[i - 1] ?? root;
    pts.push(
      i === 0 ? root : v3.add(prev, [(-Math.cos(ang) * len) / n, 0, (Math.sin(ang) * len) / n]),
    );
  }
  // A hanging tail must stay off the ground: lift the whole curve if the tip would dip under it.
  const low = Math.min(...pts.map((p) => p[2]));
  const lift = Math.max(0, r0 * 0.9 - low);
  return tube(
    pts.map((p) => [p[0], p[1], p[2] + lift * (p === root ? 0 : 1)]),
    (t) => {
      const bare = (1 - 0.65 * t ** 1.5) * (0.85 + 0.3 * Math.sin(Math.PI * Math.min(1, t * 1.4)));
      const brush = (0.5 + 0.58 * Math.sin(Math.PI * t ** 0.8)) * (1 - 0.65 * t ** 5);
      return r0 * (bare + (brush - bare) * bushy);
    },
  );
}

/** Area of a planar-ish polygon (Newell normal length / 2). */
export function polygonArea(p: readonly Vec3[]): number {
  let n: Vec3 = [0, 0, 0];
  for (let i = 0; i < p.length; i++)
    n = v3.add(n, v3.cross(p[i] ?? [0, 0, 0], p[(i + 1) % p.length] ?? [0, 0, 0]));
  return v3.len(n) / 2;
}
