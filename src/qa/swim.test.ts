// swim: each kinematic error a clip can make fails with its own code; the published wave passes.

import { describe, expect, it } from 'bun:test';
import { type CompiledAsset, dmath, quatFromAxisAngle } from '../core/index.ts';
import { radial, rigged, spine, swimClip, swimmer, swing } from './chain-fixtures.ts';
import { bodyChain, measureWave } from './chain-wave.ts';
import { swimFindings } from './swim.ts';

const codes = (a: CompiledAsset): string[] => [...new Set(swimFindings(a).map((f) => f.code))];

describe('swim', () => {
  it('fails a tail beating too fast for the speed (Strouhal, stride)', () => {
    const found = codes(swimmer({ stride: 0.3 }));
    expect(found).toContain('T3D_QA_SWIM_STROUHAL');
    expect(found).toContain('T3D_QA_SWIM_STRIDE');
  });

  it('reads Strouhal only on `cruise`', () => {
    expect(codes(swimmer({ name: 'idle', stride: 0.45, tail: 0.23 }))).not.toContain(
      'T3D_QA_SWIM_STROUHAL',
    );
  });

  it('fails a wave running tail to head', () => {
    expect(codes(swimmer({ lambda: -0.95 }))).toContain('T3D_QA_SWIM_WAVE');
  });

  it('fails a standing wave: every station flips together', () => {
    expect(codes(swimmer({ lambda: 50 }))).toContain('T3D_QA_SWIM_WAVE');
  });

  it('fails a wave no faster than the body (slip)', () => {
    expect(codes(swimmer({ lambda: 0.6, stride: 0.75 }))).toContain('T3D_QA_SWIM_SLIP');
  });

  it('fails a tail swing out of band, both ways', () => {
    expect(codes(swimmer({ tail: 0.32 }))).toContain('T3D_QA_SWIM_TAIL');
    expect(codes(swimmer({ tail: 0.08 }))).toContain('T3D_QA_SWIM_TAIL');
  });

  it('fails a front-heavy envelope and a body with no head motion', () => {
    const front = swimmer({ envelope: (s) => 1 - 0.7 * s });
    expect(codes(front)).toContain('T3D_QA_SWIM_ENVELOPE');
    expect(codes(front)).toContain('T3D_QA_SWIM_HEAD');
  });

  it('fails a body swinging about its middle (no recoil on the root)', () => {
    expect(codes(swimmer({ recoil: false }))).toContain('T3D_QA_SWIM_RECOIL');
  });

  it('fails a `burst` that buys speed with amplitude or a new wavelength', () => {
    const louder = swimmer({}, { name: 'burst', f: 3, tail: 0.235 });
    expect(codes(louder)).toContain('T3D_QA_SWIM_BURST');
    const shorter = swimmer({}, { name: 'burst', f: 3, lambda: 0.7 });
    expect(codes(shorter)).toContain('T3D_QA_SWIM_BURST');
  });

  it('fails a `cruise` that travels with a still tail', () => {
    const still = swimClip({ tail: 0 });
    expect(codes(rigged(spine(16, 2), [still]))).toEqual(['T3D_QA_SWIM_BEAT']);
  });

  it('passes the published wave, cruise and burst, at every link count of the LODs', () => {
    for (const links of [16, 8, 4]) {
      const a = swimmer({ links }, { links, name: 'burst', f: 3 });
      expect(swimFindings(a).map((f) => f.message)).toEqual([]);
    }
  });

  it('reads a beat faster than 15 Hz from the clip keys: a small trout bursting at 22 Hz', () => {
    const fast = { length: 0.3, f: 22, beats: 4, keysPerBeat: 16 };
    const a = swimmer({ length: 0.3 }, { ...fast, name: 'burst' });
    expect(swimFindings(a).map((f) => f.message)).toEqual([]);
    const sk = a.skeleton;
    const body = sk && bodyChain(sk);
    const clip = a.clips?.[1];
    const w = sk && body && clip ? measureWave(sk, body, clip) : null;
    expect(w?.frequency).toBeCloseTo(22, 6);
  });

  it('passes an eel: short wave, exponential envelope, small tail swing', () => {
    const eel = {
      lambda: 0.6,
      stride: 0.43,
      tail: 0.14,
      envelope: (s: number) => dmath.exp(3 * (s - 1)),
    };
    expect(swimFindings(swimmer(eel)).map((f) => f.message)).toEqual([]);
  });

  it('measures what the fixture was baked with', () => {
    const a = swimmer({ f: 1.5, stride: 0.7, lambda: 1 });
    const sk = a.skeleton;
    const body = sk && bodyChain(sk);
    const clip = a.clips?.[0];
    const w = sk && body && clip ? measureWave(sk, body, clip) : null;
    expect(w?.frequency).toBeCloseTo(1.5, 6);
    expect(w?.speed).toBeCloseTo(0.7 * 1.5 * 2, 3);
    expect((w?.wavelength ?? 0) / 2).toBeGreaterThan(0.85);
    expect((w?.wavelength ?? 0) / 2).toBeLessThan(1.15);
  });

  it('finds the wave in any plane: a whale beats up and down', () => {
    const c = swimClip();
    const up = {
      ...c,
      tracks: c.tracks.map((t) => {
        if (t.path === 'translation') {
          const values = Float32Array.from(t.values);
          for (let k = 0; k < values.length; k += 3) {
            values[k + 2] = values[k + 1] ?? 0;
            values[k + 1] = 0;
          }
          return { ...t, values };
        }
        const values = Float32Array.from(t.values);
        for (let k = 0; k < values.length; k += 4) {
          const a = 2 * dmath.atan2(values[k + 2] ?? 0, values[k + 3] ?? 1);
          values.set(quatFromAxisAngle([0, 1, 0], -a), k);
        }
        return { ...t, values };
      }),
    };
    expect(swimFindings(rigged(spine(16, 2), [up])).map((f) => f.message)).toEqual([]);
  });

  it('stays out of ground assets, radial plans, in-place clips and turns', () => {
    const bad = swimClip({ stride: 0.3 });
    expect(swimFindings(rigged(spine(16, 2), [bad], 'ground'))).toEqual([]);
    expect(swimFindings(rigged(spine(16, 2), [{ ...bad, name: 'turn_l' }]))).toEqual([]);
    const arms = radial(8, 6);
    expect(bodyChain(arms)).toBeNull();
    expect(swimFindings(rigged(spine(16, 2), [swing('spine_3', [0, 0, 1], 20)]))).toEqual([]);
  });
});
