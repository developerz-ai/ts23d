// Gaits: an unreachable stance target is reported, the planted toe stays put in the world, timing
// follows the Froude number, and every gait clip loops with its root speed = stride ÷ cycle.

import { describe, expect, it } from 'bun:test';
import type { Quat } from '../core/index.ts';
import { creaturePlan } from './creature.ts';
import { quadrupedRig } from './creature-clips.ts';
import { rigBones } from './creature-limits.ts';
import type { CreatureSpec } from './creature-spec.ts';
import { FEET, footAt, GAITS, gaitTiming, swingAlong } from './gait.ts';
import { gaitClip, gaitPose } from './gait-bake.ts';
import { solveStance } from './gait-ik.ts';
import { forward, tailOf } from './pose.ts';

const wolf: CreatureSpec = {
  skeleton: 'quadruped',
  mass: 40,
  length: 1.15,
  height: 0.8,
  colours: {
    coat: [0.5, 0.45, 0.4],
    belly: [0.8, 0.78, 0.7],
    nose: [0.05, 0.05, 0.05],
    iris: [0.6, 0.4, 0.1],
    keratin: [0.1, 0.09, 0.08],
  },
};
const { bones } = creaturePlan(wolf);
const arm = rigBones(bones, null, null);
const rig = quadrupedRig(arm, '');
if (!rig) throw new Error('test wolf has no quadruped rig');
const hip = rig.legs.lh[0].head[2];

describe('gait IK', () => {
  it('reports how far a toe it cannot reach is missed (a foot 1 m behind the hip)', () => {
    const leg = rig.legs.lh;
    const far = solveStance(
      leg,
      leg[0].head,
      [0, 0, 0, 1],
      [leg[3].tail[0] - 1, leg[3].tail[1], 0.022],
      0,
      0.5,
    );
    expect(far.miss).toBeGreaterThan(0.2);
    const rest = solveStance(leg, leg[0].head, [0, 0, 0, 1], leg[3].tail, 0, 0.5);
    expect(rest.miss).toBeLessThan(1e-9);
    for (const q of rest.local) expect(Math.abs(q[3])).toBeCloseTo(1, 9);
  });
});

describe('gait timing (Froude, Alexander & Jayes 1983)', () => {
  it('walks slower than it trots, trots slower than it gallops; stride 2.3·Fr^0.3·h', () => {
    const [w, t, g] = (['walk', 'trot', 'gallop'] as const).map((n) => gaitTiming(GAITS[n], hip));
    expect(w?.speed ?? 0).toBeLessThan(t?.speed ?? 0);
    expect(t?.speed ?? 0).toBeLessThan(g?.speed ?? 0);
    expect(w?.stride).toBeCloseTo(2.3 * 0.2 ** 0.3 * hip, 9);
    expect(GAITS.walk.duty).toBeGreaterThan(0.5);
    expect(GAITS.gallop.duty).toBeLessThan(0.5);
  });

  it('a stance toe is still in the world: its offset falls exactly as the root moves on', () => {
    const g = GAITS.trot;
    const t = gaitTiming(g, hip);
    const a = footAt(g, t, 'lh', 0.05);
    const b = footAt(g, t, 'lh', 0.15);
    expect(a.stance && b.stance).toBe(true);
    expect(a.dx - b.dx).toBeCloseTo(t.speed * 0.1 * t.seconds, 9);
    expect(swingAlong(g, t, 0, -0.2, 0.3)).toBeCloseTo(-0.2, 12);
    expect(swingAlong(g, t, 1, -0.2, 0.3)).toBeCloseTo(0.3, 12);
  });
});

describe('gait clips', () => {
  for (const name of ['walk', 'trot', 'gallop'] as const)
    it(`${name}: planted toes never miss, the loop closes, the root speed is stride ÷ cycle`, () => {
      const { clip, timing, miss } = gaitClip(name, rig, GAITS[name], hip);
      expect(miss).toBeLessThan(1e-3);
      const root = clip.tracks[0];
      expect(root && 'bone' in root ? root.bone : '').toBe('spine_0');
      const n = root?.times.length ?? 0;
      expect((root?.values[(n - 1) * 3] ?? 0) / clip.seconds).toBeCloseTo(timing.speed, 4);
      for (const t of clip.tracks.slice(1)) {
        const s = t.values.length / t.times.length;
        for (let k = 0; k < s; k++)
          expect(t.values[(t.times.length - 1) * s + k]).toBeCloseTo(t.values[k] ?? 0, 5);
      }
    });

  it('trots on diagonal pairs: LH and RF land together, LH and LF half a stride apart', () => {
    const g = GAITS.trot;
    const t = gaitTiming(g, hip);
    for (const phi of [0.1, 0.3, 0.6, 0.9]) {
      const f = Object.fromEntries(FEET.map((x) => [x, footAt(g, t, x, phi).stance]));
      expect(f['lh']).toBe(f['rf']);
      expect(f['lh']).not.toBe(f['lf']);
    }
  });

  it('a stance key puts the toe tip on its ground point', () => {
    const g = GAITS.walk;
    const t = gaitTiming(g, hip);
    const k = gaitPose(g, t, rig, 0.1, hip);
    const w = forward(arm, {
      rotation: k.rot as Map<string, Quat>,
      root: k.root,
      offset: k.offset,
    });
    const paw = rig.legs.lh[3];
    const at = w.get(paw.name);
    expect(at ? tailOf(paw, at)[2] : 0).toBeCloseTo(paw.tail[2], 6);
  });
});
