// Foot lock: without it a recoiling body drags every planted foot along; with it the ankle stays on
// its rest point at every key, the foot keeps its orientation, and jaws driven by hydraClips open.

import { describe, expect, it } from 'bun:test';
import { type Clip, quatRotate, type Vec3 } from '../core/index.ts';
import { clipPose, jointWorlds } from '../qa/clip-pose.ts';
import { bodyPlan } from './body-plan.ts';
import { HYDRA } from './body-plan-fixtures.ts';
import { lockFeet } from './body-plan-footlock.ts';
import type { BodyPlan } from './body-plan-types.ts';
import { hydraClips } from './neck-clips.ts';

const plan: BodyPlan = bodyPlan(HYDRA);
const necks = Array.from({ length: 5 }, (_, i) => `neck_${i}`);
const heads = Array.from({ length: 5 }, (_, i) => `head_${i}`);
const legs = ['fore_l', 'fore_r', 'hind_l', 'hind_r'];

const strike = (o: { legs?: readonly string[] }): Clip => {
  const c = hydraClips(plan, { necks, heads, seed: 7, ...o }).find((x) => x.name === 'strike_2');
  if (!c) throw new Error('no strike');
  return c;
};

function endOf(c: Clip, bone: string, t: number): Vec3 {
  const b = plan.bones.find((x) => x.name === bone);
  const w = jointWorlds({ bones: plan.bones }, clipPose(c, t)).get(bone);
  if (!b || !w) throw new Error(`no bone ${bone}`);
  const o = quatRotate(w.rot, [
    b.tail[0] - b.head[0],
    b.tail[1] - b.head[1],
    b.tail[2] - b.head[2],
  ]);
  return [w.head[0] + o[0], w.head[1] + o[1], w.head[2] + o[2]];
}

const worstSlide = (c: Clip, bone: string): number => {
  const rest = endOf(c, bone, 0);
  let worst = 0;
  for (let i = 0; i <= 40; i++) {
    const p = endOf(c, bone, (i / 40) * c.seconds);
    worst = Math.max(worst, Math.hypot(p[0] - rest[0], p[1] - rest[1], p[2] - rest[2]));
  }
  return worst;
};

describe('foot lock', () => {
  it('lets the feet slide with the recoil when it is off', () => {
    expect(worstSlide(strike({}), 'fore_l_2')).toBeGreaterThan(0.004);
  });

  it('holds every foot on its rest point when legs are named', () => {
    const c = strike({ legs });
    for (const l of legs) expect(worstSlide(c, `${l}_2`)).toBeLessThan(0.0015);
  });

  it('keeps each key in the hemisphere of the one before, through turns near 180°', () => {
    // The root circles 1 m wide: the leg swings past 180°, where the sign of w alone says nothing.
    const leg = plan.chains.filter((c) => c.id === 'fore_l');
    const n = 13;
    const times = Float32Array.from({ length: n }, (_, i) => i / 30);
    const values = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      const a = (k / (n - 1)) * 2 * Math.PI;
      values.set([0, Math.sin(a), 1 - Math.cos(a)], k * 3);
    }
    const circling: Clip = {
      name: 'circle',
      seconds: (n - 1) / 30,
      loop: true,
      tracks: [{ bone: 'body_0', path: 'translation', times, values }],
    };
    const turned = lockFeet(circling, 'body_0', leg).tracks.filter((t) => t.path === 'rotation');
    expect(turned.length).toBe(3);
    for (const t of turned)
      for (let k = 1; k < n; k++) {
        let dot = 0;
        for (let j = 0; j < 4; j++)
          dot += (t.values[k * 4 + j] ?? 0) * (t.values[(k - 1) * 4 + j] ?? 0);
        expect(dot).toBeGreaterThanOrEqual(0);
      }
  });

  it('refuses a leg it cannot solve', () => {
    expect(() => strike({ legs: ['tail'] })).toThrow(/foot lock solves 3/);
  });
});

describe('hydra jaws', () => {
  it('refuses jaws that do not pair with the necks', () => {
    expect(() => hydraClips(plan, { necks, jaws: ['head_0'], seed: 1 })).toThrow(/differ/);
  });

  it('turns only the named jaw chains', () => {
    const jaws = necks.map((_, k) => `head_${k}`);
    const set = hydraClips(plan, { necks, jaws, seed: 1 });
    const idle = set.find((c) => c.name === 'idle');
    const turned = idle?.tracks.some((t) => 'bone' in t && t.bone === 'head_2_0');
    expect(turned).toBe(true);
  });
});
