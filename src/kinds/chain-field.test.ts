// poseChain: refuses what it cannot pose honestly (over-twist, broken chains), keeps link length,
// integrates the field over each joint's share of the curve, and mirrors twist on `_l` / `_r`.

import { describe, expect, it } from 'bun:test';
import type { Vec3 } from '../core/index.ts';
import { bodyPlan } from './body-plan.ts';
import type { BodyPlan, PlanChain } from './body-plan-types.ts';
import {
  type ChainField,
  fadeField,
  MAX_JOINT_TWIST,
  poseChain,
  sumFields,
} from './chain-field.ts';
import { planOf, straightChain } from './chain-fixtures.ts';
import { forward, tailOf } from './pose.ts';

const chain = straightChain('c', [0, 0, 0], [-1, 0, 0], 2, 8);
const plan = planOf('c', 2, [chain]);

function tip(p: BodyPlan, c: PlanChain, field: ChainField, t = 0): Vec3 {
  const pose = poseChain(c, field, t);
  const world = forward(p.bones, { rotation: pose.rotation, offset: pose.offset });
  const last = c.links.at(-1)?.bone;
  const w = last && world.get(last.name);
  if (!last || !w) throw new Error('no tip');
  return tailOf(last, w);
}

describe('poseChain', () => {
  it('refuses a joint twisting past 45.6 degrees, naming the fix', () => {
    // 8 links: 8 rad per chain length is 1 rad = 57 degrees per joint.
    expect(() => poseChain(chain, { tw: () => 8 }, 0)).toThrow(/45\.6/);
  });

  it('accepts twist just inside the limit', () => {
    const rate = MAX_JOINT_TWIST * 8 * 0.99;
    expect(() => poseChain(chain, { tw: () => rate }, 0)).not.toThrow();
  });

  it('refuses links that are not parent to child', () => {
    const [a, b] = chain.links;
    if (!a || !b) throw new Error('fixture');
    const broken = { ...chain, links: [b, a] };
    expect(() => poseChain(broken, {}, 0)).toThrow(/T3D_RECIPE_INVALID|arc positions|hang/);
  });

  it('bends a constant curvature into a circular arc of the same length', () => {
    const k = 1.2;
    const end = tip(plan, chain, { kn: () => k });
    // Chord of an arc: 2 (L / κL) sin(κL / 2), with the first half-link's heading included.
    const chord = Math.hypot(end[0], end[1]);
    const exact = (2 * 2 * Math.sin(k / 2)) / k;
    expect(Math.abs(chord - exact) / exact).toBeLessThan(0.002);
  });

  it('keeps the chain length without strain, and stretches child joints with it', () => {
    const bent = poseChain(chain, { kn: () => 2 }, 0);
    expect(bent.offset.size).toBe(0);
    const stretched = tip(plan, chain, { e: () => 0.5 });
    // The last link has no child to carry its strain: 7 of 8 links stretch.
    expect(-stretched[0]).toBeCloseTo(2 + (0.5 * 2 * 7) / 8, 9);
  });

  it('adds and fades fields', () => {
    const f = sumFields({ kn: () => 1, base: () => ({ bend: 0.2 }) }, { kn: () => 2 });
    expect(f.kn?.(0, 0)).toBe(3);
    const half = fadeField(f, () => 0.5);
    expect(half.kn?.(0, 0)).toBe(1.5);
    expect(half.base?.(0).bend).toBe(0.1);
  });

  it('twists mirrored chains the mirror-image way', () => {
    const p = bodyPlan({
      name: 'fins',
      length: 1,
      chains: [
        {
          name: 'spine',
          path: [
            [0.5, 0, 0],
            [-0.5, 0, 0],
          ],
          radius: [0.1, 0.1],
          links: 2,
        },
        {
          name: 'fin',
          parent: { chain: 'spine', link: 0 },
          repeat: { kind: 'mirror' },
          path: [
            [0, 0.1, 0],
            [-0.1, 0.4, -0.05],
            [-0.15, 0.7, -0.1],
          ],
          radius: [0.05, 0.04, 0.01],
          links: 4,
        },
      ],
    });
    const [l, r] = [p.chains.find((c) => c.id === 'fin_l'), p.chains.find((c) => c.id === 'fin_r')];
    if (!l || !r) throw new Error('no mirrored fins');
    // Twist then bend: the tip only lands mirrored if the twist itself is mirrored.
    const field: ChainField = { tw: () => 1.5, kn: () => 1 };
    const [a, b] = [tip(p, l, field), tip(p, r, field)];
    expect(a[0]).toBeCloseTo(b[0], 9);
    expect(a[1]).toBeCloseTo(-b[1], 9);
    expect(a[2]).toBeCloseTo(b[2], 9);
  });
});
