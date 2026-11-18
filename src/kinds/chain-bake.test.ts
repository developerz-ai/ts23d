// bakeChainClip: loops close, root motion comes first, recoil holds the centre of mass, key density
// follows the wave, quaternions stay in one hemisphere, and the same input gives the same bytes.

import { describe, expect, it } from 'bun:test';
import type { Clip, Track } from '../core/index.ts';
import { clipPose, jointWorlds } from '../qa/clip-pose.ts';
import { bakeChainClip, type ChainClipSpec, KEYS_PER_CYCLE, loopLength } from './chain-bake.ts';
import { ds21Envelope, travellingWave } from './chain-drivers.ts';
import { fishPlan } from './chain-fixtures.ts';

const plan = fishPlan({ length: 2 });
const spine = plan.chains[0];
if (!spine) throw new Error('fixture has no spine');
const field = travellingWave({ f: 1, lambda: 0.95, envelope: ds21Envelope() });
const spec: ChainClipSpec = {
  name: 'swim',
  plan,
  drives: [{ chain: spine, field }],
  seconds: 2,
  cycles: 2,
  loop: true,
  root: (t) => ({ pos: [1.4 * t, 0, 0], yaw: 0 }),
  recoil: { chains: [spine], axes: [1] },
};

/** Peak-to-peak lateral centre of mass over the clip, share of L. */
function comSwing(c: Clip): number {
  const sk = { bones: plan.bones };
  const ys: number[] = [];
  for (let i = 0; i < 120; i++) {
    const w = jointWorlds(sk, clipPose(c, (i / 120) * c.seconds));
    let sum = 0;
    for (const l of spine?.links ?? []) sum += w.get(l.bone.name)?.head[1] ?? 0;
    ys.push(sum / (spine?.links.length ?? 1));
  }
  return (Math.max(...ys) - Math.min(...ys)) / plan.length;
}

const rotationOf = (c: Clip): Track[] => c.tracks.filter((t) => t.path === 'rotation');

describe('bakeChainClip', () => {
  it('refuses a frequency that cannot loop', () => {
    expect(() => loopLength(0, 2)).toThrow(/frequency/);
  });

  it('refuses a loop whose root does not come back round or level', () => {
    expect(() => bakeChainClip({ ...spec, root: (t) => ({ pos: [0, 0, t], yaw: 0 }) })).toThrow(
      /higher/,
    );
    expect(() => bakeChainClip({ ...spec, root: (t) => ({ pos: [0, 0, 0], yaw: t }) })).toThrow(
      /rad round/,
    );
  });

  it('refuses a chain driven twice', () => {
    expect(() => bakeChainClip({ ...spec, drives: [...spec.drives, ...spec.drives] })).toThrow(
      /driven twice/,
    );
  });

  it('fits a whole number of cycles', () => {
    const { seconds, cycles } = loopLength(0.7, 2);
    expect(cycles).toBe(2);
    expect(seconds * 0.7).toBeCloseTo(2, 9);
  });

  it('swings the centre of mass without recoil, and not with it', () => {
    const { recoil: _drop, ...bare } = spec;
    expect(comSwing(bakeChainClip(bare))).toBeGreaterThan(0.02);
    expect(comSwing(bakeChainClip(spec))).toBeLessThan(0.005);
  });

  it('puts root travel first and closes the seam except for it', () => {
    const c = bakeChainClip(spec);
    const root = c.tracks[0];
    if (!root || !('bone' in root)) throw new Error('no root track');
    expect(root.bone).toBe('spine_0');
    expect(root.path).toBe('translation');
    const n = root.times.length;
    expect((root.values[(n - 1) * 3] ?? 0) - (root.values[0] ?? 0)).toBeCloseTo(2.8, 5);
    expect(root.values[(n - 1) * 3 + 1]).toBe(root.values[1] ?? NaN);
    for (const t of rotationOf(c))
      for (let k = 0; k < 4; k++) expect(t.values[(n - 1) * 4 + k]).toBe(t.values[k] ?? NaN);
  });

  it('keys at least 16 per cycle, and 30 per second when that is more', () => {
    const { root: _root, ...still } = spec;
    const fast = bakeChainClip({ ...still, seconds: 0.5, cycles: 5 });
    expect(fast.tracks[0]?.times.length).toBe(5 * KEYS_PER_CYCLE + 1);
    expect(bakeChainClip(spec).tracks[0]?.times.length).toBe(61);
  });

  it('keeps consecutive quaternions in one hemisphere', () => {
    for (const t of rotationOf(bakeChainClip(spec)))
      for (let i = 1; i < t.times.length; i++) {
        let d = 0;
        for (let k = 0; k < 4; k++)
          d += (t.values[(i - 1) * 4 + k] ?? 0) * (t.values[i * 4 + k] ?? 0);
        expect(d).toBeGreaterThan(0);
      }
  });

  it('bakes identical bytes twice', () => {
    const [a, b] = [bakeChainClip(spec), bakeChainClip(spec)];
    a.tracks.forEach((t, i) => {
      expect(
        Buffer.from(t.values.buffer).equals(
          Buffer.from(b.tracks[i]?.values.buffer ?? new ArrayBuffer(0)),
        ),
      ).toBe(true);
    });
  });
});
