// Hydra and snake clips, measured by forward kinematics of the baked tracks: necks stay apart and
// out of step, a strike keeps to the acceleration bound with the body answering, and the snake's
// wave is the one its parameters claim.

import { describe, expect, it } from 'bun:test';
import {
  type Clip,
  checkClip,
  compile,
  defineAsset,
  quatRotate,
  type Vec3,
} from '../core/index.ts';
import { chainCrossFindings } from '../qa/chain-cross.ts';
import { chainTwistFindings } from '../qa/chain-twist.ts';
import { clipPose, jointWorlds } from '../qa/clip-pose.ts';
import { bodyPlan } from './body-plan.ts';
import { HYDRA } from './body-plan-fixtures.ts';
import type { BodyPlan } from './body-plan-types.ts';
import { fishPlan, hydraPlan } from './chain-fixtures.ts';
import { fitSerpenoid, HU_2009, hydraClips, SNAKE_WAVE, snakeClips } from './neck-clips.ts';

const real = bodyPlan(HYDRA);
const count = 5;
const necks = Array.from({ length: count }, (_, i) => `neck_${i}`);
const heads = Array.from({ length: count }, (_, i) => `head_${i}`);
const clips = hydraClips(real, { necks, heads, seed: 7 });

const named = (set: readonly Clip[], name: string): Clip => {
  const c = set.find((x) => x.name === name);
  if (!c) throw new Error(`no clip ${name}`);
  return c;
};

function tipAt(p: BodyPlan, c: Clip, bone: string, t: number): Vec3 {
  const b = p.bones.find((x) => x.name === bone);
  const w = jointWorlds({ bones: p.bones }, clipPose(c, t)).get(bone);
  if (!b || !w) throw new Error(`no bone ${bone}`);
  const o = quatRotate(w.rot, [
    b.tail[0] - b.head[0],
    b.tail[1] - b.head[1],
    b.tail[2] - b.head[2],
  ]);
  return [w.head[0] + o[0], w.head[1] + o[1], w.head[2] + o[2]];
}

const headTip = (i: number): string => `head_${i}_1`;
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function correlation(a: readonly number[], b: readonly number[]): number {
  const mean = (v: readonly number[]): number => v.reduce((x, y) => x + y, 0) / v.length;
  const [ma, mb] = [mean(a), mean(b)];
  let [ab, aa, bb] = [0, 0, 0];
  a.forEach((x, i) => {
    const y = b[i] ?? 0;
    ab += (x - ma) * (y - mb);
    aa += (x - ma) ** 2;
    bb += (y - mb) ** 2;
  });
  return ab / Math.sqrt(aa * bb);
}

/** The plan and its clips as an unskinned asset, for the QA gates that read motion. */
const rigOf = (p: BodyPlan, set: readonly Clip[]) =>
  compile(
    defineAsset({
      name: 'rig',
      kind: 'creature',
      budget: { triangles: [1, 1, 1], bones: p.bones.length },
      clips: set,
      build(ctx) {
        for (const { name, ...b } of p.bones) ctx.bone(name, b);
      },
    }),
  );

describe('hydraClips', () => {
  for (const links of [12, 4])
    it(`keeps every neck out of the others at ${links} links, within the twist limit`, () => {
      const p = hydraPlan(5, links);
      const rig = rigOf(p, hydraClips(p, { necks, seed: 7 }));
      expect(chainCrossFindings(rig).map((f) => f.message)).toEqual([]);
      expect(chainTwistFindings(rig).map((f) => f.message)).toEqual([]);
    });

  it('keeps the necks of the resolved fixture apart too', () => {
    const rig = rigOf(real, clips);
    expect(chainCrossFindings(rig).map((f) => f.message)).toEqual([]);
  });

  it('refuses no necks, and heads that do not pair up', () => {
    expect(() => hydraClips(real, { necks: [], seed: 1 })).toThrow(/no necks/);
    expect(() => hydraClips(real, { necks, heads: ['head_0'], seed: 1 })).toThrow(/differ/);
  });

  it('bakes clips the asset checker accepts', () => {
    for (const c of clips) expect(checkClip('t', c)).toBe(c);
  });

  it('makes one idle and one strike per neck', () => {
    expect(clips.map((c) => c.name)).toEqual(['idle', ...necks.map((_, i) => `strike_${i}`)]);
  });

  it('closes the idle loop', () => {
    for (const t of named(clips, 'idle').tracks) {
      const s = t.values.length / t.times.length;
      const n = t.times.length;
      for (let k = 0; k < s; k++) expect(t.values[(n - 1) * s + k]).toBe(t.values[k] ?? NaN);
    }
  });

  it('keeps heads out of step and apart, in their order round the shoulder', () => {
    const idle = named(clips, 'idle');
    const frames = Array.from({ length: 96 }, (_, f) =>
      necks.map((_, i) => tipAt(real, idle, headTip(i), (f / 96) * idle.seconds)),
    );
    for (let i = 0; i < count; i++)
      for (let j = i + 1; j < count; j++) {
        const y = (k: number): number[] => frames.map((f) => f[k]?.[1] ?? 0);
        expect(Math.abs(correlation(y(i), y(j)))).toBeLessThan(0.7);
      }
    for (const f of frames) {
      const ys = f.map((p) => p[1]);
      for (let i = 1; i < ys.length; i++)
        expect(ys[i] ?? 0).toBeGreaterThan((ys[i - 1] ?? 0) + 0.1);
    }
  });

  it('stays under the neck joint limit [C13]', () => {
    for (const t of named(clips, 'idle').tracks.filter((x) => x.path === 'rotation'))
      for (let i = 0; i < t.times.length; i++) {
        const v = t.values.subarray(i * 4, i * 4 + 4);
        const deg =
          (2 * Math.atan2(Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0), Math.abs(v[3] ?? 1)) * 180) /
          Math.PI;
        expect(deg).toBeLessThanOrEqual(25.6);
      }
  });

  it('changes with the seed and repeats with it', () => {
    const bytes = (c: Clip): number[] => c.tracks.flatMap((t) => [...t.values]);
    const again = hydraClips(real, { necks, heads, seed: 7 });
    const other = hydraClips(real, { necks, heads, seed: 8 });
    expect(bytes(named(again, 'idle'))).toEqual(bytes(named(clips, 'idle')));
    expect(bytes(named(other, 'idle'))).not.toEqual(bytes(named(clips, 'idle')));
  });

  it('strikes within the acceleration bound, the body answering', () => {
    const c = named(clips, 'strike_2');
    expect(c.loop).toBe(false);
    // At the keys: between them LINEAR playback has corners, not acceleration.
    const n = (c.tracks[0]?.times.length ?? 1) - 1;
    const dt = c.seconds / n;
    const path = Array.from({ length: n + 1 }, (_, i) => tipAt(real, c, headTip(2), i * dt));
    let peak = 0;
    let travel = 0;
    for (let i = 1; i < n; i++) {
      const [a, b, d] = [path[i - 1], path[i], path[i + 1]];
      if (!a || !b || !d) continue;
      peak = Math.max(
        peak,
        Math.hypot(a[0] - 2 * b[0] + d[0], a[1] - 2 * b[1] + d[1], a[2] - 2 * b[2] + d[2]) /
          (dt * dt),
      );
      travel = Math.max(travel, dist(b, path[0] ?? b));
    }
    expect(travel).toBeGreaterThan(0.1);
    expect(peak).toBeLessThanOrEqual(279);
    const root = c.tracks[0];
    if (!root) throw new Error('no root track');
    const xs = Array.from({ length: root.times.length }, (_, i) => root.values[i * 3] ?? 0);
    expect(Math.max(...xs.map(Math.abs))).toBeGreaterThan(1e-3);
    expect(Math.max(...xs.map(Math.abs))).toBeLessThan(0.25);
  });

  it('brings the striking jaw back to its idle pose by the end of the clip', () => {
    const set = hydraClips(real, { necks, jaws: heads, seed: 7 });
    const [idle, strike] = [named(set, 'idle'), named(set, 'strike_2')];
    const bone = 'head_2_0';
    const turn = (c: Clip, t: number) => clipPose(c, t).rotation?.get(bone) ?? [0, 0, 0, 1];
    const gape = (q: readonly number[]): number =>
      2 * Math.atan2(Math.hypot(q[0] ?? 0, q[1] ?? 0, q[2] ?? 0), Math.abs(q[3] ?? 1));
    // It does open wide on the way.
    const steps = Array.from({ length: 40 }, (_, i) => (i / 40) * strike.seconds);
    expect(Math.max(...steps.map((t) => gape(turn(strike, t))))).toBeGreaterThan(0.3);
    const end = gape(turn(strike, strike.seconds));
    expect(Math.abs(end - gape(turn(idle, strike.seconds)))).toBeLessThan(1e-3);
  });

  it('bakes on a plain fan of necks without heads', () => {
    const p = hydraPlan(3, 8);
    const set = hydraClips(p, { necks: ['neck_0', 'neck_1', 'neck_2'], seed: 1 });
    expect(set).toHaveLength(4);
  });
});

describe('snakeClips', () => {
  const snake = fishPlan({ length: 2, links: 28 });
  const set = snakeClips(snake, { chain: 'spine' });

  /** Lateral zero crossings of the posed body, as positions along travel. */
  function crossings(c: Clip, t: number): number[] {
    const sk = { bones: snake.bones };
    const w = jointWorlds(sk, clipPose(c, t));
    const pts = snake.bones.map((b) => w.get(b.name)?.head ?? [0, 0, 0]);
    const mean = pts.reduce((a, p) => a + (p[1] ?? 0), 0) / pts.length;
    const out: number[] = [];
    pts.forEach((p, i) => {
      const q = pts[i + 1];
      if (!q) return;
      const [a, b] = [(p[1] ?? 0) - mean, (q[1] ?? 0) - mean];
      if (a * b < 0) out.push((p[0] ?? 0) + (((q[0] ?? 0) - (p[0] ?? 0)) * a) / (a - b));
    });
    return out;
  }

  it('refuses a wave no serpenoid can make', () => {
    expect(() => fitSerpenoid(0.4, 5)).toThrow(/serpenoid/);
  });

  it('fits the measured wave along travel', () => {
    const x = crossings(named(set, 'slither'), 0.3);
    const gaps = x.slice(1).map((v, i) => Math.abs(v - (x[i] ?? 0)));
    const wave = (2 * gaps.reduce((a, b) => a + b, 0)) / gaps.length / snake.length;
    expect(wave).toBeGreaterThan(SNAKE_WAVE.lambda * 0.85);
    expect(wave).toBeLessThan(SNAKE_WAVE.lambda * 1.15);
  });

  it('keeps the [H09] curve as published, at its 0.71 L along travel', () => {
    const hu = snakeClips(snake, { chain: 'spine', shape: 'hu2009' });
    const x = crossings(named(hu, 'slither'), 0.3);
    const gaps = x.slice(1).map((v, i) => Math.abs(v - (x[i] ?? 0)));
    const wave = (2 * gaps.reduce((a, b) => a + b, 0)) / gaps.length / snake.length;
    expect(HU_2009.alpha).toBe(7);
    expect(wave).toBeGreaterThan(0.6);
    expect(wave).toBeLessThan(0.82);
  });

  it('travels 0.22 L per period when slithering', () => {
    const c = named(set, 'slither');
    const root = c.tracks[0];
    if (!root) throw new Error('no root');
    const n = root.times.length;
    expect((root.values[(n - 1) * 3] ?? 0) - (root.values[0] ?? 0)).toBeCloseTo(
      SNAKE_WAVE.stride * 2 * snake.length,
      5,
    );
  });

  it('sidewinds with its lowest points nearly still and none under the floor', () => {
    const c = named(set, 'sidewind');
    const frames = 60;
    let worstSink = 0;
    let slide = 0;
    let samples = 0;
    const tips = snake.bones.map((b) => b.name);
    let prev: Vec3[] | null = null;
    for (let f = 0; f <= frames; f++) {
      const now = tips.map((b) => tipAt(snake, c, b, (f / frames) * c.seconds));
      const zs = now.map((p) => p[2]);
      const [lo, hi] = [Math.min(...zs), Math.max(...zs)];
      worstSink = Math.min(worstSink, lo);
      if (prev)
        now.forEach((p, i) => {
          const q = prev?.[i];
          if (!q || p[2] > lo + 0.1 * (hi - lo)) return;
          slide += Math.hypot(p[0] - q[0], p[1] - q[1]);
          samples++;
        });
      prev = now;
    }
    expect(worstSink).toBeGreaterThan(-1e-3);
    expect(samples).toBeGreaterThan(0);
    // Compare with how far the body itself goes per frame.
    const root = c.tracks[0];
    const n = root?.times.length ?? 1;
    const travel = Math.hypot(
      (root?.values[(n - 1) * 3] ?? 0) - (root?.values[0] ?? 0),
      (root?.values[(n - 1) * 3 + 1] ?? 0) - (root?.values[1] ?? 0),
    );
    expect(travel).toBeGreaterThan(0.05);
    expect(slide / samples).toBeLessThan((0.35 * travel) / frames);
  });
});
