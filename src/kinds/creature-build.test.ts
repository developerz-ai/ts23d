// Build knobs held as numbers: the hind cannon's length (`hock`), a heel under the hip (`heel`),
// a stance that holds its width under thicker limbs (`track`), and a hump raised on the topline.

import { describe, expect, it } from 'bun:test';
import { Ts23dError } from '../core/index.ts';
import { sculptField } from '../primitives/index.ts';
import { blockOut } from './creature-body.ts';
import { bonesOf } from './creature-skeleton.ts';
import { type CreatureSpec, checkCreature } from './creature-spec.ts';

const BEAR: CreatureSpec = {
  skeleton: 'quadruped',
  family: 'ursid',
  stance: 'plantigrade',
  mass: 400,
  length: 2.1,
  height: 1.1,
  build: { depth: 0.6, width: 0.85 },
  colours: {
    coat: [0.3, 0.2, 0.1],
    nose: [0.02, 0.02, 0.02],
    iris: [0.2, 0.1, 0.05],
    keratin: [0.7, 0.65, 0.6],
  },
};
const withBuild = (b: CreatureSpec['build']): CreatureSpec => ({
  ...BEAR,
  build: { ...BEAR.build, ...b },
});
const hind = (s: CreatureSpec) => {
  const l = bonesOf(s).legs.find((x) => x.name === 'hind');
  if (!l) throw new Error('no hind leg');
  return l;
};

describe('build knobs refuse nonsense first', () => {
  it('names the knob for a hock, heel, track or topline point outside its range', () => {
    const cases: [CreatureSpec['build'], string][] = [
      [{ hock: 0.9 }, 'build.hock'],
      [{ heel: 0.6 }, 'build.heel'],
      [{ track: 0.05 }, 'build.track'],
      [{ topline: [{ at: 1.4, rise: 0.05 }] }, 'build.topline[0].at'],
      [{ topline: [{ at: 0.9, rise: 0.5 }] }, 'build.topline[0].rise'],
    ];
    for (const [b, says] of cases) {
      expect(() => checkCreature(withBuild(b))).toThrow(Ts23dError);
      expect(() => checkCreature(withBuild(b))).toThrow(says);
    }
  });
});

describe('hind stance', () => {
  it('by default the heel trails the hip (a dog stretched); heel: 0 puts it under the hip', () => {
    const d = hind(BEAR);
    const span = Math.abs((d.joints[0]?.[0] ?? 0) - (d.joints[2]?.[0] ?? 0));
    expect(span).toBeGreaterThan(0.1);
    const u = hind(withBuild({ heel: 0 }));
    expect(Math.abs((u.joints[0]?.[0] ?? 0) - (u.joints[2]?.[0] ?? 1))).toBeLessThan(1e-9);
    // The sole runs forward from the heel; the stifle stays in front of the hip.
    expect(u.foot[0]).toBeGreaterThan(u.joints[2]?.[0] ?? Infinity);
    expect(u.joints[1]?.[0] ?? 0).toBeGreaterThan(u.joints[0]?.[0] ?? Infinity);
    // The hind feet come forward by what the heel did.
    expect(u.foot[0] - d.foot[0]).toBeCloseTo(span, 6);
  });

  it('hock sets the hind cannon: lower hock, same foot and hip', () => {
    const wolf: CreatureSpec = { ...BEAR, family: 'canid', stance: 'digitigrade', mass: 40 };
    const a = hind({ ...wolf, length: 1.15, height: 0.8 });
    const b = hind({ ...wolf, length: 1.15, height: 0.8, build: { ...BEAR.build, hock: 0.24 } });
    expect(a.joints[2]?.[2] ?? 0).toBeCloseTo(0.28 * 0.8, 6);
    expect(b.joints[2]?.[2] ?? 0).toBeCloseTo(0.24 * 0.8, 6);
    expect(b.joints[0]).toEqual(a.joints[0] ?? [0, 0, 0]);
  });

  it('track holds the stance width when the limbs thicken', () => {
    const outer = (s: CreatureSpec): number =>
      Math.max(...bonesOf(s).legs.map((l) => l.foot[1] + l.footSize[1]));
    const plain = outer(BEAR);
    const thick = outer(withBuild({ limbs: 1.2 }));
    expect(thick).toBeGreaterThan(plain * 1.03);
    // Narrower track, same outer edge as the plain animal (within 1 %).
    const W = 0.85 * 0.6 * 1.1;
    const held = outer(withBuild({ limbs: 1.2, track: 0.34 - (thick - plain) / W }));
    expect(Math.abs(held / plain - 1)).toBeLessThan(0.01);
  });
});

describe('topline', () => {
  it('a hump point raises the back there by its rise and nowhere else', () => {
    const top = (s: CreatureSpec, x: number): number => {
      const f = sculptField(blockOut(bonesOf(s)), { color: [1, 1, 1] }).field;
      let z = 2;
      while (z > 0 && f([x, 0, z]) > 0) z -= 0.002;
      return z;
    };
    const humped = withBuild({ topline: [{ at: 0.85, rise: 0.08, span: 0.3 }] });
    const b = bonesOf(BEAR);
    const [xh, xw] = [b.spine[1]?.[0] ?? 0, b.spine[3]?.[0] ?? 0];
    const x = xh + 0.85 * (xw - xh);
    const lift = top(humped, x) - top(BEAR, x);
    expect(lift).toBeGreaterThan(0.06 * 1.1);
    expect(lift).toBeLessThan(0.1 * 1.1);
    expect(Math.abs(top(humped, xh) - top(BEAR, xh))).toBeLessThan(0.004);
    // The bones the muscle map and the rig index stay where they were.
    expect(bonesOf(humped).trunk.slice(0, 3)).toEqual(b.trunk.slice(0, 3));
    expect(bonesOf(humped).spine).toEqual(b.spine);
  });
});
