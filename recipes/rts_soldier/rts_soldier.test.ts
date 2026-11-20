// At port arms the left glove holds the carbine's shroud. Failure first: the support point was
// built along the barrel only (no lift up the grip axis to the shroud, which rides 12 cm up it), so
// the glove floated about 5 cm under the weapon it was meant to hold.
import { describe, expect, it } from 'bun:test';
import { compile, dmath, type Vec3 } from '@developerz.ai/ts23d';
import { onPort, rts_soldier, SHROUD, shroudR } from './rts_soldier.ts';

/** Distance from p to segment a–b. */
function toSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) /
        (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]),
    ),
  );
  return dmath.hypot(p[0] - a[0] - d[0] * t, p[1] - a[1] - d[1] * t, p[2] - a[2] - d[2] * t);
}

describe('rts_soldier port arms', () => {
  // LOD2's glove is a 12-triangle block: its corners are no measure of its surface.
  for (const lod of [0, 1] as const)
    it(`LOD${lod}: the left glove closes on the shroud`, () => {
      const c = compile(rts_soldier, { lod });
      const hand = c.parts.find((p) => p.name === 'hand_l')?.mesh;
      const grip = c.parts.find((p) => p.name === 'rifle_grip');
      expect(hand).toBeDefined();
      expect(grip).toBeDefined();
      // The rifle's grip joint is the fist: read the pose from the compiled figure, not a constant.
      const g = c.joints?.find((j) => j.name === 'grip_r')?.at ?? [0, 0, 0];
      const a = onPort(g, [SHROUD.x0, 0, SHROUD.z]);
      const b = onPort(g, [SHROUD.x1, 0, SHROUD.z]);
      const pos = hand?.positions ?? new Float32Array();
      let near = Number.POSITIVE_INFINITY;
      for (let i = 0; i < pos.length / 3; i++)
        near = Math.min(
          near,
          toSegment([pos[i * 3] ?? 0, pos[i * 3 + 1] ?? 0, pos[i * 3 + 2] ?? 0], a, b),
        );
      // Some of the glove's surface reaches the shroud's skin (or wraps into it).
      expect(near).toBeLessThanOrEqual(shroudR(0.42) + 0.005);
    });
});
