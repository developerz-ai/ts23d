// Planted paws for in-place clips (ADR 013): a standing animal breathes, looks and bites over
// feet that stay where they are. The body pose of a key runs through forward kinematics; every
// leg whose toe tip the pose carried off its rest point is re-solved with the gaits' leg IK
// (gait-ik.ts `solvePlanted`: paw and metapodial where they rest, elbow / stifle taking up the
// difference), so the ribs and withers move and the paws do not. A leg the pose leaves alone
// keeps no keys.

import type { Bone, Quat } from '../core/index.ts';
import type { Foot } from './gait.ts';
import { type LegBones, solvePlanted } from './gait-ik.ts';
import { forward, IDENTITY, tailOf } from './pose.ts';

/** A toe tip within this of its rest point has not moved, metres. */
const STILL = 1e-7;

/** A leg's four bones, or null when the chain is not root → paw in four. */
export function legOf(bones: readonly Bone[], prefix: string, foot: Foot): LegBones | null {
  const pair = foot[1] === 'h' ? 'hind' : 'fore';
  const side = foot[0];
  const chain = [0, 1, 2, 3].map((i) =>
    bones.find((b) => b.name === `${prefix}${pair}_${side}_${i}`),
  );
  const [a, b, c, d] = chain;
  const extra = bones.some((x) => x.name === `${prefix}${pair}_${side}_4`);
  return a && b && c && d && !extra ? [a, b, c, d] : null;
}

/**
 * The pose with every leg's toe tip back on its rest point: local rotations of the four leg bones
 * are replaced by the planted solution under the posed body. Legs the body did not move are left
 * as they are, so a clip that only turns the neck gains no leg tracks.
 */
export function plantLegs(
  bones: readonly Bone[],
  legs: readonly LegBones[],
  rotation: ReadonlyMap<string, Quat>,
): Map<string, Quat> {
  const out = new Map(rotation);
  if (legs.length === 0) return out;
  const world = forward(bones, { rotation });
  for (const leg of legs) {
    const [upper, , , paw] = leg;
    const root = world.get(upper.name);
    const pawWorld = world.get(paw.name);
    if (!root || !pawWorld) continue;
    const toe = tailOf(paw, pawWorld);
    if (Math.hypot(toe[0] - paw.tail[0], toe[1] - paw.tail[1], toe[2] - paw.tail[2]) < STILL)
      continue;
    const parent = upper.parent === undefined ? undefined : world.get(upper.parent);
    const solve = solvePlanted(leg, root.head, parent?.rot ?? IDENTITY);
    leg.forEach((b, i) => {
      out.set(b.name, solve.local[i] ?? IDENTITY);
    });
  }
  return out;
}
