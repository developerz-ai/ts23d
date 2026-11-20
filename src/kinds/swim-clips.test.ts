// swimClips against the published ranges, measured on the BAKED tracks with the same reader the
// `swim` gate uses (src/qa/chain-wave.ts), plus the seam, burst and fin rules it does not cover.

import { describe, expect, it } from 'bun:test';
import {
  type Clip,
  type CompiledAsset,
  checkClip,
  dmath,
  type Quat,
  quatRotate,
  type Track,
  type Vec3,
} from '../core/index.ts';
import { bodyChain, type ClipWave, measureWave } from '../qa/chain-wave.ts';
import { clipPose, jointWorlds } from '../qa/clip-pose.ts';
import { swimFindings } from '../qa/swim.ts';
import { bodyPlan } from './body-plan.ts';
import { SHARK } from './body-plan-fixtures.ts';
import type { BodyPlan } from './body-plan-types.ts';
import { fishPlan } from './chain-fixtures.ts';
import { swimClips } from './swim-clips.ts';
import { BITE_TIMING, PROTRUSION } from './swim-fast.ts';
import { SWIM_PRESETS, type SwimPreset } from './swim-presets.ts';

const finned = { caudal: ['caudal_u', 'caudal_l'], pectoral: ['pec_l', 'pec_r'] };

const asset = (plan: BodyPlan, clips: readonly Clip[]): CompiledAsset =>
  ({
    name: plan.name,
    medium: 'water',
    skeleton: { bones: plan.bones },
    clips,
  }) as unknown as CompiledAsset;

function measure(plan: BodyPlan, clips: readonly Clip[], name: string): ClipWave {
  const sk = { bones: plan.bones };
  const body = bodyChain(sk);
  const clip = clips.find((c) => c.name === name);
  if (!body || !clip) throw new Error(`no body or clip ${name}`);
  const w = measureWave(sk, body, clip);
  if (!w) throw new Error(`clip ${name} does not travel`);
  return w;
}

const clipNamed = (clips: readonly Clip[], name: string): Clip => {
  const c = clips.find((x) => x.name === name);
  if (!c) throw new Error(`no clip ${name}`);
  return c;
};

const trackOf = (c: Clip, bone: string, path: Track['path']): Track | undefined =>
  c.tracks.find((t) => 'bone' in t && t.bone === bone && t.path === path);

const angle = (q: Quat): number => 2 * dmath.atan2(dmath.hypot(q[0], q[1], q[2]), Math.abs(q[3]));

/** Peak-to-peak lateral swing of the last body station, 600 samples of the keyed clip. */
function tailSwing(plan: BodyPlan, c: Clip): number {
  const sk = { bones: plan.bones };
  const body = bodyChain(sk);
  const last = body?.bones.at(-1);
  if (!last) throw new Error('no body');
  const ys: number[] = [];
  for (let i = 0; i < 600; i++) {
    const pose = clipPose(c, (i / 600) * c.seconds);
    const w = jointWorlds(sk, pose).get(last.name);
    if (!w) throw new Error('no tail joint');
    const [h, e] = [last.head, last.tail];
    const d: Vec3 = [e[0] - h[0], e[1] - h[1], e[2] - h[2]];
    ys.push(w.head[1] + quatRotate(w.rot, d)[1]);
  }
  return Math.max(...ys) - Math.min(...ys);
}

const sizes: Record<SwimPreset, number> = { shark: 2, tuna: 1.5, trout: 1, eel: 1 };

describe('swimClips', () => {
  it('refuses a trunk that does not run head to tail along -X', () => {
    const plan = fishPlan();
    const spine = plan.chains[0];
    if (!spine) throw new Error('no spine');
    const flipped = {
      ...plan,
      chains: [
        {
          ...spine,
          links: spine.links.map((l) => ({
            ...l,
            bone: { ...l.bone, head: [-l.bone.head[0], 0, 0], tail: [-l.bone.tail[0], 0, 0] },
          })),
        },
      ],
    } as BodyPlan;
    expect(() => swimClips(flipped, { chain: 'spine' })).toThrow(/along -X/);
  });

  it('refuses an unknown chain, naming the ones there are', () => {
    expect(() => swimClips(fishPlan(), { chain: 'nope' })).toThrow(/no chain 'nope'/);
  });

  for (const preset of Object.keys(SWIM_PRESETS) as SwimPreset[]) {
    describe(preset, () => {
      const p = SWIM_PRESETS[preset];
      const plan = fishPlan({ length: sizes[preset], fins: true });
      const clips = swimClips(plan, {
        chain: 'spine',
        preset,
        ...finned,
        jaw: { lower: 'jaw_low', upper: 'jaw_up' },
      });
      const cruise = measure(plan, clips, 'cruise');
      const burst = measure(plan, clips, 'burst');

      it('passes the swim gate', () => {
        expect(swimFindings(asset(plan, clips)).map((f) => f.message)).toEqual([]);
      });

      it('lands the measured numbers on the preset', () => {
        const L = sizes[preset];
        const tail = cruise.excursion.at(-1) ?? 0;
        expect(tail / L).toBeCloseTo(p.tailApp, 2);
        expect(cruise.speed / (cruise.frequency * L)).toBeCloseTo(p.stride, 2);
        expect((cruise.frequency * tail) / cruise.speed).toBeCloseTo(p.tailApp / p.stride, 1);
        expect(cruise.wavelength / L / p.lambda).toBeGreaterThan(0.85);
        expect(cruise.wavelength / L / p.lambda).toBeLessThan(1.15);
        expect(cruise.heading).toBe('tailward');
      });

      it('bursts by frequency, holding tail swing and wavelength', () => {
        expect(burst.frequency / cruise.frequency).toBeGreaterThan(1.5);
        // Read densely: the gate's 30 fps lands only 3 to 7 samples on a burst beat.
        const dense = (name: string): number => tailSwing(plan, clipNamed(clips, name));
        expect(Math.abs(dense('burst') / dense('cruise') - 1)).toBeLessThan(0.02);
        expect(burst.speed / burst.frequency).toBeCloseTo(cruise.speed / cruise.frequency, 3);
      });
    });
  }

  // The gate's limit is 0.35: a preset sitting on it fails on rounding, at some link counts only.
  for (const links of [10, 16, 24])
    it(`keeps the tuna head under the head-to-tail limit with margin at ${links} links`, () => {
      const plan = fishPlan({ length: 2, links, fins: true });
      const clips = swimClips(plan, { chain: 'spine', preset: 'tuna', ...finned });
      for (const name of ['cruise', 'burst', 'idle']) {
        const { excursion } = measure(plan, clips, name);
        expect((excursion[0] ?? 1) / (excursion.at(-1) ?? 1)).toBeLessThan(0.34);
      }
      expect(swimFindings(asset(plan, clips)).map((f) => f.message)).toEqual([]);
    });

  const plan = fishPlan({ length: 2, fins: true });
  const shark = {
    chain: 'spine',
    preset: 'shark',
    ...finned,
    jaw: { lower: 'jaw_low', upper: 'jaw_up' },
  } as const;
  const clips = swimClips(plan, shark);

  it('bakes clips the asset checker accepts', () => {
    for (const c of clips) expect(checkClip('t', c)).toBe(c);
  });

  it('steepens only the eel envelope in a burst [T04]; other presets keep the cruise shape', () => {
    const headShare = (preset: SwimPreset): number => {
      const p = fishPlan({ length: sizes[preset] });
      const set = swimClips(p, { chain: 'spine', preset });
      const ratio = ({ excursion: e }: ReturnType<typeof measure>): number =>
        (e[0] ?? 0) / (e.at(-1) ?? 1);
      return ratio(measure(p, set, 'burst')) / ratio(measure(p, set, 'cruise'));
    };
    expect(headShare('eel')).toBeGreaterThan(1.5);
    expect(Math.abs(headShare('shark') - 1)).toBeLessThan(0.02);
  });

  it('names the whole set, root motion first', () => {
    expect(clips.map((c) => c.name)).toEqual([
      'cruise',
      'burst',
      'turn_l',
      'turn_r',
      'cstart_l',
      'cstart_r',
      'idle',
      'bite',
    ]);
    const first = clipNamed(clips, 'cruise').tracks[0];
    expect(first && 'bone' in first ? first.bone : '').toBe('spine_0');
    expect(first?.path).toBe('translation');
  });

  it('closes every loop to the root travel', () => {
    for (const c of clips.filter((x) => x.loop))
      for (const t of c.tracks) {
        const s = t.values.length / t.times.length;
        const n = t.times.length;
        const root = 'bone' in t && t.bone === 'spine_0' && t.path === 'translation';
        const flip =
          t.path === 'rotation' &&
          [0, 1, 2, 3].reduce(
            (d, k) => d + (t.values[k] ?? 0) * (t.values[(n - 1) * 4 + k] ?? 0),
            0,
          ) < 0
            ? -1
            : 1;
        for (let k = root ? 2 : 0; k < s; k++)
          expect(
            Math.abs((t.values[k] ?? 0) - (t.values[(n - 1) * s + k] ?? 0) * flip),
          ).toBeLessThan(1e-4);
      }
  });

  it('keeps pectorals within 3 degrees in cruise', () => {
    const t = trackOf(clipNamed(clips, 'cruise'), 'pec_l_0', 'rotation');
    if (!t) throw new Error('no pectoral track');
    for (let i = 0; i < t.times.length; i++) {
      const q = [...t.values.subarray(i * 4, i * 4 + 4)] as unknown as Quat;
      expect((angle(q) * 180) / Math.PI).toBeLessThanOrEqual(3);
    }
  });

  it('lags the caudal lobes differently', () => {
    const c = clipNamed(clips, 'cruise');
    const [u, l] = [trackOf(c, 'caudal_u_0', 'rotation'), trackOf(c, 'caudal_l_0', 'rotation')];
    expect(u && l && [...u.values].some((v, i) => Math.abs(v - (l.values[i] ?? 0)) > 1e-3)).toBe(
      true,
    );
  });

  it('turns a full circle, left and right mirrored', () => {
    const sk = { bones: plan.bones };
    const heading = (c: Clip, u: number): number => {
      const w = jointWorlds(sk, clipPose(c, u * c.seconds)).get('spine_0');
      if (!w) throw new Error('no root');
      return w.head[1];
    };
    const [l, r] = [clipNamed(clips, 'turn_l'), clipNamed(clips, 'turn_r')];
    expect(heading(l, 0.25)).toBeGreaterThan(0.5);
    expect(heading(r, 0.25)).toBeLessThan(-0.5);
  });

  it('c-starts: turns the mean heading 77 degrees, one shot, opposite for each side', () => {
    const l = clipNamed(clips, 'cstart_l');
    const r = clipNamed(clips, 'cstart_r');
    expect(l.loop).toBe(false);
    const end = (c: Clip): number[] => {
      const t = trackOf(c, 'spine_0', 'translation');
      if (!t) throw new Error('no root');
      return [...t.values.subarray(t.values.length - 3)];
    };
    expect(end(l)[1] ?? 0).toBeGreaterThan(0.1);
    expect(end(r)[1] ?? 0).toBeLessThan(-0.1);
    const [lx, ly] = end(l);
    const dir = (dmath.atan2(ly ?? 0, lx ?? 1) * 180) / Math.PI;
    expect(dir).toBeGreaterThan(55);
    expect(dir).toBeLessThan(85);
  });

  it('protrudes the upper jaw while the mouth closes [M97]', () => {
    const bite = clipNamed(clips, 'bite');
    expect(bite.loop).toBe(false);
    const jaw = trackOf(bite, 'jaw_low_0', 'rotation');
    const up = trackOf(bite, 'jaw_up_0', 'translation');
    if (!jaw || !up) throw new Error('jaw tracks missing');
    const series = (t: Track, f: (i: number) => number): number[] =>
      Array.from(t.times, (_, i) => f(i));
    const gape = series(jaw, (i) =>
      angle([...jaw.values.subarray(i * 4, i * 4 + 4)] as unknown as Quat),
    );
    const out = series(up, (i) => up.values[i * 3] ?? 0);
    const peak = (v: number[]): number => v.indexOf(Math.max(...v));
    const T = bite.seconds;
    const [g, p] = [jaw.times[peak(gape)] ?? 0, up.times[peak(out)] ?? 0];
    expect(g / T).toBeCloseTo(BITE_TIMING.gapePeak, 1);
    expect(p).toBeGreaterThan(g);
    expect(p / T).toBeLessThan(BITE_TIMING.closed);
    expect(Math.max(...out)).toBeLessThanOrEqual(PROTRUSION * 0.2 * plan.length + 1e-6);
  });

  it('swims the bodyPlan shark through the gate', () => {
    const real = bodyPlan(SHARK);
    const set = swimClips(real, {
      chain: 'spine',
      preset: 'shark',
      caudal: ['caudal_upper', 'caudal_lower'],
      pectoral: ['pectoral_l', 'pectoral_r'],
    });
    expect(swimFindings(asset(real, set)).map((f) => f.message)).toEqual([]);
  });

  it('bakes the same bytes twice', () => {
    const again = swimClips(plan, shark);
    clips.forEach((c, i) => {
      c.tracks.forEach((t, k) => {
        expect([...(again[i]?.tracks[k]?.values ?? [])]).toEqual([...t.values]);
      });
    });
  });
});
