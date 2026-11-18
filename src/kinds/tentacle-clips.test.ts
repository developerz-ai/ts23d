// Octopus clips measured from baked tracks: a reach is a bend running to the tip on a bell-shaped
// speed with the arm lengthening behind it, crawl has no repeating limb pattern, and a 128-joint
// octopus stays small.

import { describe, expect, it } from 'bun:test';
import { type Clip, checkClip, compile, defineAsset, type Track } from '../core/index.ts';
import { chainCrossFindings } from '../qa/chain-cross.ts';
import { chainTwistFindings } from '../qa/chain-twist.ts';
import { bodyPlan } from './body-plan.ts';
import { OCTOPUS } from './body-plan-fixtures.ts';
import type { BodyPlan } from './body-plan-types.ts';
import { MAX_JOINT_TWIST } from './chain-field.ts';
import { octopusPlan } from './chain-fixtures.ts';
import { crawlSchedule, octopusClips, REACH_STRAIN, recruitAt } from './tentacle-clips.ts';

const plan = octopusPlan(8, 16);
const arms = Array.from({ length: 8 }, (_, i) => `arm_${i}`);
const clips = octopusClips(plan, { arms, seed: 3 });

const named = (name: string): Clip => {
  const c = clips.find((x) => x.name === name);
  if (!c) throw new Error(`no clip ${name}`);
  return c;
};

const rot = (c: Clip, bone: string): Track | undefined =>
  c.tracks.find((t) => 'bone' in t && t.bone === bone && t.path === 'rotation');

const angleAt = (t: Track | undefined, i: number): number => {
  if (!t) return 0;
  const v = t.values.subarray(i * 4, i * 4 + 4);
  return 2 * Math.atan2(Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0), Math.abs(v[3] ?? 1));
};

/** Bytes as glTF stores them: float keys, one shared time accessor per clip. */
const bytes = (c: Clip): number =>
  c.tracks.reduce((n, t) => n + t.values.byteLength, c.tracks[0]?.times.byteLength ?? 0);

/** The plan and its clips as an unskinned asset, for the QA gates that read motion. */
const rigOf = (p: BodyPlan, set: readonly Clip[]) =>
  compile(
    defineAsset({
      name: 'rig',
      kind: 'creature',
      medium: 'water',
      budget: { triangles: [1, 1, 1], bones: p.bones.length },
      clips: set,
      build(ctx) {
        for (const { name, ...b } of p.bones) ctx.bone(name, b);
      },
    }),
  );

describe('octopusClips', () => {
  for (const links of [16, 5])
    it(`keeps every arm out of the others at ${links} links, within the twist limit`, () => {
      const p = octopusPlan(8, links);
      const rig = rigOf(p, octopusClips(p, { arms, seed: 3 }));
      expect(chainCrossFindings(rig).map((f) => f.message)).toEqual([]);
      expect(chainTwistFindings(rig).map((f) => f.message)).toEqual([]);
    });

  it('keeps the arms of the resolved fixture apart too', () => {
    const real = bodyPlan(OCTOPUS);
    const ids = real.chains.filter((c) => c.spec === 'arm').map((c) => c.id);
    const rig = rigOf(real, octopusClips(real, { arms: ids, seed: 3 }));
    expect(chainCrossFindings(rig).map((f) => f.message)).toEqual([]);
  });

  it('bakes clips the asset checker accepts', () => {
    for (const c of clips) expect(checkClip('t', c)).toBe(c);
  });

  it('refuses an octopus with no arms', () => {
    expect(() => octopusClips(plan, { arms: [], seed: 1 })).toThrow(/no arms/);
  });

  it('runs the reach bend monotonically to the tip at a bell-shaped speed', () => {
    const c = named('reach_0');
    const links = 16;
    const n = rot(c, 'arm_0_0')?.times.length ?? 0;
    const place: number[] = [];
    for (let k = 0; k < n; k++) {
      let best = 0;
      let at = 0;
      for (let j = 1; j < links; j++) {
        const a = angleAt(rot(c, `arm_0_${j}`), k);
        if (a > best) [best, at] = [a, j];
      }
      place.push(at / links);
    }
    for (let k = 1; k < n; k++)
      expect(place[k] ?? 0).toBeGreaterThanOrEqual((place[k - 1] ?? 0) - 1 / links - 1e-9);
    // Smoothed over a sixth of the reach, the fastest stretch is in the middle third.
    const w = Math.round(n / 6);
    let best = -1;
    let when = 0;
    for (let k = 0; k + w < n; k++) {
      const v = (place[k + w] ?? 0) - (place[k] ?? 0);
      if (v > best) [best, when] = [v, (k + w / 2) / n];
    }
    expect(when).toBeGreaterThan(1 / 3);
    expect(when).toBeLessThan(2 / 3);
  });

  it('lengthens the arm behind the bend by the measured strain', () => {
    const c = named('reach_0');
    const t = c.tracks.find((x) => 'bone' in x && x.bone === 'arm_0_1' && x.path === 'translation');
    if (!t) throw new Error('no stretch track');
    const n = t.times.length;
    const step = Math.hypot(...t.values.subarray((n - 1) * 3, n * 3));
    // Link 0 is 1/16 of a 1 m arm; at the end the bump is at the tip, this link fully strained.
    expect(step / (1 / 16)).toBeCloseTo(REACH_STRAIN, 2);
    expect(Math.hypot(...t.values.subarray(0, 3))).toBeCloseTo(0, 6);
  });

  it('keeps every idle joint inside the twist limit and closes the loop', () => {
    const c = named('idle');
    for (const t of c.tracks) {
      const n = t.times.length;
      for (let k = 0; k < 4; k++) expect(t.values[(n - 1) * 4 + k]).toBe(t.values[k] ?? NaN);
      for (let i = 0; i < n; i++) expect(angleAt(t, i)).toBeLessThan(MAX_JOINT_TWIST * 1.5);
    }
  });

  it('bends the front arms about three times as often as the rear', () => {
    const c = named('idle');
    const crossings = (bone: string): number => {
      const t = rot(c, bone);
      if (!t) return 0;
      const axis = t.values.length / t.times.length - 2;
      let found = 0;
      for (let i = 1; i < t.times.length; i++) {
        const a = t.values[(i - 1) * 4 + axis] ?? 0;
        const b = t.values[i * 4 + axis] ?? 0;
        if (a * b < 0) found++;
      }
      return found;
    };
    // arm_0 points to +X, arm_3 and arm_4 to -X in the fixture's ring.
    expect(crossings('arm_0_8') / Math.max(1, crossings('arm_3_8'))).toBeGreaterThan(2);
  });

  it('folds a fetch round three moving joints', () => {
    const c = named('fetch');
    const peak = (j: number): number => {
      const t = rot(c, `arm_0_${j}`);
      let m = 0;
      for (let i = 0; i < (t?.times.length ?? 0); i++) m = Math.max(m, angleAt(t, i));
      return m;
    };
    const all = Array.from({ length: 16 }, (_, j) => peak(j));
    const top = Math.max(...all);
    // Local maxima well above the quiet joints between them: one per hinge.
    const hinges = all.filter(
      (v, j) => v > 0.3 * top && v >= (all[j - 1] ?? 0) && v >= (all[j + 1] ?? 0),
    );
    expect(hinges).toHaveLength(3);
  });

  it('recruits crawl arms from a seed, rear arms more, with no shared rhythm', () => {
    const chains = plan.chains.slice(1);
    const s = crawlSchedule(chains, 3);
    const counts = chains.map((c) => s.get(c.id)?.length ?? 0);
    expect(Math.max(...counts)).toBe(3);
    expect(Math.min(...counts)).toBe(1);
    expect(counts.filter((n) => n === 3)).toHaveLength(4);
    const other = crawlSchedule(chains, 4);
    expect(other.get('arm_0')).not.toEqual(s.get('arm_0'));
    const level = (id: string): number[] =>
      Array.from({ length: 200 }, (_, i) => recruitAt(s.get(id) ?? [], i / 200));
    const sum = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0);
    const rear = chains.filter((c) => (s.get(c.id)?.length ?? 0) === 3).map((c) => level(c.id));
    const [a, b] = [rear[0] ?? [], rear[1] ?? []];
    const overlap =
      sum(a.map((x, i) => x * (b[i] ?? 0))) /
      Math.sqrt(sum(a.map((x) => x * x)) * sum(b.map((x) => x * x)));
    expect(overlap).toBeLessThan(0.8);
  });

  it('crawls with its root first, wrapping recruitment across the seam', () => {
    const c = named('crawl');
    const root = c.tracks[0];
    expect(root && 'bone' in root ? root.bone : '').toBe('mantle_0');
    expect(root?.path).toBe('translation');
    expect(recruitAt([{ start: 0.95, width: 0.2 }], 0.02)).toBeGreaterThan(0);
  });

  it('stays small for a 128-joint octopus', () => {
    expect(plan.bones.length - 2).toBe(128);
    // Float keys at 30 per second, 128 joints: 6 s is about 370 KiB before quantisation.
    expect(bytes(named('idle'))).toBeLessThan(420 * 1024);
    expect(bytes(named('reach_0'))).toBeLessThan(40 * 1024);
  });

  it('bakes on the bodyPlan octopus and repeats its bytes', () => {
    const real = bodyPlan(OCTOPUS);
    const ids = real.chains.filter((c) => c.spec === 'arm').map((c) => c.id);
    const [a, b] = [
      octopusClips(real, { arms: ids, seed: 3 }),
      octopusClips(real, { arms: ids, seed: 3 }),
    ];
    expect(a.map((c) => c.name)).toContain('reach_7');
    a.forEach((c, i) => {
      c.tracks.forEach((t, k) => {
        expect([...t.values]).toEqual([...(b[i]?.tracks[k]?.values ?? [])]);
      });
    });
  });

  it('adds a mantle pulse on request', () => {
    const set = octopusClips(plan, { arms, seed: 3, mantle: { part: 'mantle' } });
    expect(set.at(-1)?.name).toBe('mantle_pulse');
  });
});
