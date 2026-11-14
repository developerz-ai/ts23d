// Landmarks from a few proportions: `bonesOf(spec)` lays out the skeleton for each type. The biped
// here; quadruped and winged in creature-quadruped.ts; bird, fish and serpent in
// creature-skeleton-other.ts. Joints follow the stance (digitigrade hock at ~⅓ leg height,
// plantigrade heel on the ground, unguligrade fetlock on a long cannon bone); limb radius from
// mass (allometry).

import type { Vec3 } from '../core/index.ts';
import { type Bones, feet, type HeadFrame, headToWorld, type Limb } from './creature-bones.ts';
import { footPlan } from './creature-family.ts';
import { sizes, tailChain } from './creature-layout.ts';
import { quadrupedBones } from './creature-quadruped.ts';
import { birdBones, fishBones, serpentBones } from './creature-skeleton-other.ts';
import { tube } from './creature-skin.ts';
import type { CreatureSpec } from './creature-spec.ts';

const deg = Math.PI / 180;

/** Biped: an upright trunk on two plantigrade legs, arms hanging, head level on top. */
function biped(s: CreatureSpec): Bones {
  const z = sizes(s);
  const { H } = z;
  const D = (s.build?.depth ?? 0.22) * H;
  const W = (s.build?.width ?? 1.3) * D;
  const hipZ = 0.6 * H;
  const r = z.limbR;
  const atlas: Vec3 = [0.02 * H, 0, H + 0.06 * H];
  const head: HeadFrame = {
    atlas,
    pitch: (s.pose?.head ?? 0) * deg,
    length: z.headLen,
    width: z.headWidth,
    height: z.headWidth * 0.95,
    beak: false,
  };
  const y = W * 0.24;
  const hind: Limb = {
    name: 'hind',
    joints: [
      [0, y, hipZ],
      [0.04 * H, y, 0.32 * H],
      [-0.02 * H, y * 0.95, 0.06 * H],
      [0.03 * H, y * 0.95, 0.04 * H],
    ],
    radii: [r * 1.35, r * 0.95, r * 0.7, r * 0.55],
    foot: [0.04 * H, y * 0.95, 0],
    footSize: [0.075 * H, r * 0.55, 0.04 * H],
    ...footPlan(s, z.stance, 'hind'),
    muscles: [{ at: [0.01 * H, y * 1.05, hipZ - 0.08 * H], r: [r * 1.2, r * 1.1, r * 2.2] }],
  };
  const arm = tube(
    [
      [0, W * 0.5, H - 0.04 * H],
      [-0.02 * H, W * 0.56, 0.7 * H],
      [0.03 * H, W * 0.56, 0.45 * H],
      [0.04 * H, W * 0.55, 0.38 * H],
    ],
    (t) => r * (0.9 - 0.45 * t),
  );
  return {
    skeleton: 'biped',
    stance: z.stance,
    mass: s.mass,
    height: H,
    limbR: r,
    trunk: [
      { at: [0, 0, H - 0.17 * H], r: [D / 2, W / 2, 0.2 * H] },
      { at: [0, 0, hipZ + 0.08 * H], r: [D * 0.45, W * 0.42, 0.14 * H] },
    ],
    chain: arm,
    spine: [
      [-D / 2, 0, hipZ],
      [-D / 2, 0, H],
    ],
    neck: tube([[0, 0, H - 0.1 * H], atlas], () => z.headWidth * 0.36),
    tail:
      z.tailLen > 0
        ? tailChain([-D * 0.4, 0, hipZ], z.tailLen, r * 0.5, s.pose?.tail ?? 'hang')
        : [],
    head,
    legs: [hind],
    wings: [],
    fins: [],
    ground: feet([hind]),
    mirror: true,
    nose: headToWorld(head, [z.headLen, 0, 0]),
    tailRoot: [-D * 0.4, 0, hipZ],
  };
}

/** The skeleton for any type. */
export function bonesOf(s: CreatureSpec): Bones {
  switch (s.skeleton) {
    case 'quadruped':
    case 'winged':
      return quadrupedBones(s);
    case 'biped':
      return biped(s);
    case 'bird':
      return birdBones(s);
    case 'fish':
      return fishBones(s);
    case 'serpent':
      return serpentBones(s);
  }
}
