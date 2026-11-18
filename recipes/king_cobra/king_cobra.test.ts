// The cobra against its sources and its stance: arc length, tail share, raised third and hood on the
// compiled skeleton and mesh; ground contact, planted coil and hood motion in the baked clips.
// `bun test recipes/king_cobra`.

import { describe, expect, it } from 'bun:test';
import { compile, type Mesh, triangleCount, type Vec3 } from '@developerz.ai/ts23d';
import { clipPose, jointWorlds } from '../../src/qa/clip-pose.ts';
import { posedMesh } from '../../src/render/pose-strip.ts';
import { norm } from '../_lib/body-plan-kit.ts';
import { CLIPS, king_cobra, PLAN, RIG } from './king_cobra.ts';
import {
  bellyHalf,
  COIL_TOP,
  frameAt,
  HEAD,
  HOOD_WIDTH,
  halfW,
  RAISED,
  SVL,
  TOTAL,
} from './shape.ts';

const sk = { bones: PLAN.bones };
const clip = (name: string) => {
  const c = CLIPS.find((x) => x.name === name);
  if (!c) throw new Error(`no clip ${name}`);
  return c;
};
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const heads = (name: string, u: number): Vec3[] => {
  const c = clip(name);
  const w = jointWorlds(sk, clipPose(c, u * c.seconds));
  return RIG.spine.map((b) => w.get(b)?.head ?? [0, 0, 0]);
};
const restHeads = RIG.spine.map((n) => PLAN.bones.find((b) => b.name === n)?.head ?? [0, 0, 0]);
const body = (lod: 0 | 1 | 2): Mesh => {
  const m = compile(king_cobra, { lod }).parts.find((p) => p.name === 'body')?.mesh;
  if (!m) throw new Error('no body');
  return m;
};

describe('sourced proportions', () => {
  it('is 3.5 m along the body, and the bones follow it', () => {
    let arc = 0;
    for (let i = 0; i < 2000; i++)
      arc += dist(frameAt((i / 2000) * TOTAL).p, frameAt(((i + 1) / 2000) * TOTAL).p);
    expect(Math.abs(arc / TOTAL - 1)).toBeLessThan(0.005);
    let chords = 0;
    for (const n of RIG.spine) {
      const b = PLAN.bones.find((x) => x.name === n);
      if (b) chords += dist(b.head, b.tail);
    }
    expect(Math.abs(chords / TOTAL - 1)).toBeLessThan(0.02);
  });
  it('keeps the neotype tail share', () => {
    expect((TOTAL - SVL) / TOTAL).toBeCloseTo(462 / 2547, 5);
  });
  it('scales the head from the holotype', () => {
    expect(HEAD.length / TOTAL).toBeCloseTo(72 / 3005, 5);
    expect(HEAD.width / TOTAL).toBeCloseTo(52.5 / 3005, 5);
  });
  it('holds the front third up off the pile, the head at an alert height', () => {
    expect(RAISED).toBeCloseTo(TOTAL / 3, 6);
    const front = restHeads.filter((_, i) => (i / restHeads.length) * TOTAL < RAISED);
    for (const p of front) expect(p[2]).toBeGreaterThan(COIL_TOP - 0.02);
    expect(restHeads[0]?.[2] ?? 0).toBeGreaterThan(0.65);
    expect(restHeads[0]?.[2] ?? 1).toBeLessThan(0.85);
  });
  it('turns the hood square to the hero camera', () => {
    const d = frameAt(0.26).d;
    const front = norm([-d[0], -d[1], 0]);
    const yaw = (-35 * Math.PI) / 180;
    expect(front[0] * Math.cos(yaw) + front[1] * Math.sin(yaw)).toBeGreaterThan(0.95);
    // Its face tips up toward a camera above the horizon, never down at the ground.
    expect(-d[2]).toBeGreaterThan(0);
  });
  it('stacks the coil: turns lie over turns', () => {
    const pile = restHeads.filter((_, i) => (i / restHeads.length) * TOTAL > RAISED);
    expect(Math.max(...pile.map((p) => p[2]))).toBeGreaterThan(0.08);
    expect(Math.min(...pile.map((p) => p[2]))).toBeLessThan(0.03);
    const reach = Math.max(...pile.map((p) => Math.hypot(p[0], p[1])));
    expect(reach).toBeLessThan(0.42);
  });
  it('spreads the hood wider than the head and the neck below it', () => {
    expect(2 * halfW(0.205)).toBeCloseTo(HOOD_WIDTH, 3);
    expect(HOOD_WIDTH).toBeGreaterThan(HEAD.width * 1.5);
    expect(HOOD_WIDTH).toBeGreaterThan(2 * halfW(0.8) * 1.8);
  });
  it('lies on the ground: the lowest skin touches z = 0 and none goes under', () => {
    const m = body(0);
    let low = Infinity;
    for (let i = 2; i < m.positions.length; i += 3) low = Math.min(low, m.positions[i] ?? 0);
    expect(low).toBeGreaterThan(-0.004);
    expect(low).toBeLessThan(0.006);
  });
  it('faces the belly forward on the raised neck, the back up on the ground', () => {
    expect(frameAt(0.5).d[2]).toBeLessThan(0.3);
    expect(frameAt(2.5).d[2]).toBeGreaterThan(0.95);
  });
});

describe('detail by LOD', () => {
  it('emits scales up close only and stays a few hundred triangles far away', () => {
    expect(triangleCount(body(0))).toBeGreaterThan(30_000);
    expect(triangleCount(body(2))).toBeLessThan(900);
  });
});

describe('clips', () => {
  it('ships the ground and stance clips, and no sidewind', () => {
    expect(CLIPS.map((c) => c.name).sort()).toEqual([
      'hood_up',
      'idle',
      'idle_ground',
      'rear',
      'slither',
    ]);
  });

  for (const name of ['idle', 'hood_up'])
    it(`${name} starts and ends on the rest pose, so Play does not jump`, () => {
      for (const u of [0, 1]) {
        heads(name, u).forEach((p, i) => {
          expect(dist(p, restHeads[i] as Vec3)).toBeLessThan(0.001);
        });
        const pose = clipPose(clip(name), u * clip(name).seconds);
        for (const { bone } of RIG.ribs) {
          const q = pose.rotation.get(bone) ?? [0, 0, 0, 1];
          expect(Math.hypot(q[0], q[1], q[2])).toBeLessThan(0.005);
        }
        for (const bone of RIG.tongue) {
          const t = pose.translation.get(bone) ?? [0, 0, 0];
          expect(Math.hypot(t[0], t[1], t[2])).toBeLessThan(0.001);
        }
      }
    });

  it('idle stays reared and alive, with the coil planted', () => {
    const rest = restHeads[0] as Vec3;
    let moved = 0;
    for (let i = 0; i <= 24; i++) {
      const now = heads('idle', i / 24);
      expect(now[0]?.[2] ?? 0).toBeGreaterThan(rest[2] - 0.03);
      moved = Math.max(moved, dist(now[0] as Vec3, rest));
      now.forEach((p, k) => {
        if ((k / now.length) * TOTAL > RAISED * 1.2)
          expect(dist(p, restHeads[k] as Vec3)).toBeLessThan(0.004);
      });
    }
    expect(moved).toBeGreaterThan(0.01);
  });

  it('idle_ground is the low clip: flat, hood folded', () => {
    for (const p of heads('idle_ground', 0.3)) expect(p[2]).toBeLessThan(0.08);
  });

  it('slithers flat on the ground, bending and travelling', () => {
    const [a, b] = [heads('slither', 0.1), heads('slither', 0.35)];
    for (const p of a) expect(p[2]).toBeLessThan(0.08);
    const ys = a.map((p) => p[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.25);
    expect(dist(a[0] as Vec3, b[0] as Vec3)).toBeGreaterThan(0.1);
  });

  it('keeps every slither joint at or above belly height', () => {
    for (const u of [0, 0.2, 0.4, 0.6, 0.8])
      heads('slither', u).forEach((p, i) => {
        expect(p[2]).toBeGreaterThan(bellyHalf((i / RIG.spine.length) * TOTAL) * 0.4);
      });
  });

  it('sways only the raised front in hood_up: the coil stays planted', () => {
    const [a, b] = [heads('hood_up', 0.13), heads('hood_up', 0.63)];
    expect(dist(a[1] as Vec3, b[1] as Vec3)).toBeGreaterThan(0.015);
    a.forEach((p, i) => {
      if ((i / a.length) * TOTAL > RAISED * 1.2) expect(dist(p, b[i] as Vec3)).toBeLessThan(0.004);
    });
  });

  it('folds the hood ribs for the ground and spreads them when alert', () => {
    const rib = RIG.ribs[1]?.bone ?? '';
    const turn = (name: string): number => {
      const q = clipPose(clip(name), 0.2).rotation.get(rib) ?? [0, 0, 0, 1];
      return 2 * Math.atan2(Math.hypot(q[0], q[1], q[2]), Math.abs(q[3]));
    };
    expect(turn('slither')).toBeGreaterThan(1);
    expect(turn('hood_up')).toBeLessThan(0.3);
  });

  it('rears from low to the alert stance', () => {
    expect(heads('rear', 0)[0]?.[2] ?? 1).toBeLessThan(0.1);
    expect(dist(heads('rear', 1)[0] as Vec3, restHeads[0] as Vec3)).toBeLessThan(0.01);
  });

  it('never puts skin through the floor', () => {
    const c = compile(king_cobra, { lod: 1 });
    const part = c.parts.find((p) => p.name === 'body')?.mesh;
    if (!part) throw new Error('no body');
    const rest = PLAN.bones.map((b) => b.head);
    for (const name of ['slither', 'idle', 'idle_ground', 'hood_up', 'rear'])
      for (let i = 0; i <= 12; i++) {
        const w = jointWorlds(sk, clipPose(clip(name), (i / 12) * clip(name).seconds));
        const frames = PLAN.bones.map((b) => {
          const f = w.get(b.name);
          if (!f) throw new Error(`no joint ${b.name}`);
          return f;
        });
        const m = posedMesh(part, rest, frames);
        let low = Infinity;
        for (let v = 2; v < m.positions.length; v += 3) low = Math.min(low, m.positions[v] ?? 0);
        expect(low).toBeGreaterThan(-0.003);
      }
  });

  it('closes every loop', () => {
    for (const name of ['slither', 'idle', 'idle_ground', 'hood_up']) {
      const a = clipPose(clip(name), 0).rotation;
      const b = clipPose(clip(name), clip(name).seconds).rotation;
      for (const [bone, q] of a) {
        const r = b.get(bone) ?? [0, 0, 0, 1];
        expect(Math.abs(q[0] * r[0] + q[1] * r[1] + q[2] * r[2] + q[3] * r[3])).toBeGreaterThan(
          0.9999,
        );
      }
    }
  });
});
