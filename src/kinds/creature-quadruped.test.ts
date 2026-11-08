// Quadruped anatomy rules held as numbers: elbow at the chest floor, a topline with withers, dip
// and croup, the waist tuck, leg muscle masses, head presets, the bushy tail, coat helpers
// (agouti, foreline) and seamless colour zones along a hanging tail.

import { describe, expect, it } from 'bun:test';
import { Ts23dError, type Vec3 } from '../core/index.ts';
import { bodyPaint, locator } from './creature-coat.ts';
import { headLayout } from './creature-head.ts';
import { marks } from './creature-pattern.ts';
import { bonesOf } from './creature-skeleton.ts';
import { type CreatureSpec, checkCreature } from './creature-spec.ts';

const C: CreatureSpec['colours'] = {
  coat: [0.5, 0.45, 0.4],
  nose: [0.02, 0.02, 0.02],
  iris: [0.6, 0.4, 0.1],
  keratin: [0.1, 0.09, 0.08],
};
const WOLF: CreatureSpec = {
  skeleton: 'quadruped',
  mass: 40,
  length: 1.15,
  height: 0.8,
  tail: 0.42,
  build: { depth: 0.5, tailGirth: 3 },
  colours: C,
};

const refuses = (s: CreatureSpec, says: string): void => {
  expect(() => checkCreature(s)).toThrow(Ts23dError);
  expect(() => checkCreature(s)).toThrow(says);
};

/** Lowest point of the trunk masses at x (the underline). */
const underline = (s: CreatureSpec, x: number): number => {
  let bot = Infinity;
  for (const m of bonesOf(s).trunk) {
    const u = (x - m.at[0]) / m.r[0];
    if (Math.abs(u) < 1) bot = Math.min(bot, m.at[2] - m.r[2] * Math.sqrt(1 - u * u));
  }
  return bot;
};

describe('quadruped spec: new knobs refuse nonsense first', () => {
  it('a tuck outside 0.3..1 and an unknown head preset are refused, naming the field', () => {
    refuses({ ...WOLF, build: { tuck: 0.1 } }, 'build.tuck');
    refuses({ ...WOLF, face: { preset: 'dragon' as 'canid' } }, "unknown face.preset 'dragon'");
    expect(
      checkCreature({ ...WOLF, face: { preset: 'canid' }, build: { tuck: 0.6 } }),
    ).toBeTruthy();
  });
});

describe('side-view anatomy', () => {
  const b = bonesOf(WOLF);
  const fore = b.legs.find((l) => l.name === 'fore');
  const hind = b.legs.find((l) => l.name === 'hind');

  it('the elbow sits at the chest floor (shoulder height − chest depth), not mid-leg', () => {
    const elbow = fore?.joints[1]?.[2] ?? 0;
    const floor = WOLF.height * (1 - 0.5);
    expect(Math.abs(elbow - floor)).toBeLessThan(0.05 * WOLF.height);
  });

  it('topline: withers highest, a dip behind them, the croup between', () => {
    const [, croup, dip, withers] = b.spine.map((p) => p[2]);
    expect(withers).toBeGreaterThan(croup ?? 1);
    expect(croup).toBeGreaterThan(dip ?? 1);
  });

  it('build.tuck raises the belly in front of the thigh (a greyhound waist vs a barrel)', () => {
    const x = (b.trunk[1]?.at[0] ?? 0) - 0.05;
    const lean = underline({ ...WOLF, build: { ...WOLF.build, tuck: 0.45 } }, x);
    const barrel = underline({ ...WOLF, build: { ...WOLF.build, tuck: 0.95 } }, x);
    expect(lean - barrel).toBeGreaterThan(0.08);
  });

  it('legs carry muscle masses (triceps, forearm, thigh, hamstrings, calf) and landmarks', () => {
    expect(fore?.muscles.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(hind?.muscles.length ?? 0).toBeGreaterThanOrEqual(5);
    // Landmarks only exist with the sculpted chain (LOD0/1).
    expect(hind?.muscles.some((m) => m.fine)).toBe(true);
    // The thigh is the leg's biggest mass: wider than the upper limb radius.
    const thigh = Math.max(...(hind?.muscles.map((m) => m.r[0]) ?? [0]));
    expect(thigh).toBeGreaterThan(1.3 * b.limbR);
  });

  it('a bushy tail is slim at the root and fullest past its middle; a bare one tapers', () => {
    const bushy = b.tail.map((n) => n.r);
    const mid = bushy[Math.floor(bushy.length * 0.55)] ?? 0;
    expect(mid).toBeGreaterThan(1.6 * (bushy[0] ?? 1));
    const bare = bonesOf({ ...WOLF, build: { tailGirth: 1 } }).tail.map((n) => n.r);
    expect(bare[bare.length - 1] ?? 1).toBeLessThan(bare[0] ?? 0);
  });
});

describe('head presets', () => {
  it('canid: a bigger nose and a stop the generic head has not', () => {
    const generic = headLayout(bonesOf(WOLF), WOLF);
    const canid = headLayout(bonesOf({ ...WOLF, face: { preset: 'canid' } }), {
      ...WOLF,
      face: { preset: 'canid' },
    });
    expect(canid.rt / canid.L).toBeGreaterThan((generic.rt / generic.L) * 1.2);
    expect(generic.stop).toBe(0);
    expect(canid.stop).toBeGreaterThan(0);
  });

  it('explicit face fields win over the preset', () => {
    const s: CreatureSpec = { ...WOLF, face: { preset: 'felid', width: 0.5 } };
    expect(bonesOf(s).head.width / bonesOf(s).head.length).toBeCloseTo(0.5, 6);
  });
});

describe('coat helpers', () => {
  it('agouti: dark-tipped hair on the saddle, none on the belly', () => {
    const m = marks({ kind: 'agouti', scale: 0.012, coverage: 0.45, seed: 4 }, 0.003);
    let saddle = 0;
    let belly = 0;
    for (let i = 0; i < 400; i++) {
      const p: Vec3 = [-0.4 + i * 0.002, 0.1, 0.6 + (i % 7) * 0.01];
      saddle += m(p, { v: 0.8 });
      belly += m(p, { v: -0.9 });
    }
    expect(belly).toBe(0);
    expect(saddle / 400).toBeGreaterThan(0.2);
  });

  it('foreline: paints the front of the forearm only', () => {
    const line: Vec3 = [0.02, 0.02, 0.02];
    const s: CreatureSpec = { ...WOLF, colours: { ...C, foreline: line } };
    const b = bonesOf(s);
    const fore = b.legs.find((l) => l.name === 'fore');
    const [e, w] = [fore?.joints[1] ?? [0, 0, 0], fore?.joints[2] ?? [0, 0, 0]];
    const mid: Vec3 = [(e[0] + w[0]) / 2, (e[1] + w[1]) / 2, (e[2] + w[2]) / 2];
    const r = (fore?.radii[1] ?? 0.03) * 0.8;
    const paint = bodyPaint(b, s, 0.003);
    const front = paint([mid[0] + r, mid[1], mid[2]], C.coat);
    const back = paint([mid[0] - r, mid[1], mid[2]], C.coat);
    expect(front[0]).toBeLessThan(back[0] - 0.1);
    // Without the colour, no line.
    const plain = bodyPaint(b, WOLF, 0.003)([mid[0] + r, mid[1], mid[2]], C.coat);
    expect(plain[0]).toBeCloseTo(back[0], 2);
  });

  it('a hanging tail keeps its dorsal colour down its back and its pale side toward the legs', () => {
    const b = bonesOf(WOLF);
    const at = locator(b);
    let back = Infinity;
    let front = -Infinity;
    for (let i = 0; i + 1 < b.tail.length; i++) {
      const n0 = b.tail[i];
      const n1 = b.tail[i + 1];
      if (!n0 || !n1) continue;
      // The segment's outer (dorsal) side in XZ: up-back of a drooping, back of a hanging tail.
      const d: Vec3 = [n1.at[0] - n0.at[0], 0, n1.at[2] - n0.at[2]];
      const len = Math.hypot(d[0], d[2]) || 1;
      const up: Vec3 = [d[2] / len, 0, -d[0] / len];
      for (const t of [0.1, 0.5, 0.9]) {
        const r = (n0.r + (n1.r - n0.r) * t) * 0.9;
        const c: Vec3 = [n0.at[0] + d[0] * t, 0, n0.at[2] + d[2] * t];
        back = Math.min(back, at([c[0] + up[0] * r, 0, c[2] + up[2] * r]).v);
        front = Math.max(front, at([c[0] - up[0] * r, 0, c[2] - up[2] * r]).v);
      }
    }
    expect(back).toBeGreaterThan(0.5);
    expect(front).toBeLessThan(-0.5);
  });
});
