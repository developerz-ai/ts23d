// Cinderhorn's own tests: the biology README.md argues from, appendages that grow out of the body
// (wings, horns), the membrane fused to the flank, and LOD2 keeping LOD0's outline. Heavy (LOD0
// compiles): run with `bun test recipes/dragon`.

import { describe, expect, it } from 'bun:test';
import { compile, type SculptEdit, sculptField } from '@developerz.ai/ts23d';
import {
  assertConnected,
  assertLodSilhouette,
  assertNoGaps,
  assertTouches,
} from '@developerz.ai/ts23d/testing';
import { biology, massFromLimbs } from './biology.ts';
import { bodyField, flankLine } from './body.ts';
import { dragon } from './dragon.ts';
import { headEdits } from './head.ts';
import { bossRegion, mainHornRoot } from './horns.ts';
import { C } from './palette.ts';
import { PROPORTIONS, posePoint } from './pose.ts';
import { SK } from './skeleton.ts';
import { bodyStamps, hornCollars } from './stamps.ts';

const SLOW = 180_000;

describe('biology', () => {
  it('fails on an impossible limb: a 1 cm circumference carries grams, not tonnes', () => {
    expect(massFromLimbs(10)).toBeLessThan(1);
  });

  it('mass, wings and limbs match the dossier', () => {
    const b = biology(compile(dragon, { lod: 2 }));
    // ~7 t from ~7 m³ of flesh at ~1000 kg/m³ (README "Biology").
    expect(b.mass).toBeGreaterThan(4000);
    expect(b.mass).toBeLessThan(10000);
    // Two membranes of ~7.5 m² each.
    expect(b.wingArea).toBeGreaterThan(12);
    expect(b.wingArea).toBeLessThan(18);
    // Stylised: ~20× a giant pterosaur's wing loading — it does not fly, and says so.
    expect(b.wingLoading).toBeGreaterThan(1000);
    // Overbuilt legs (stylised heavy limbs): at least strong enough for the mass.
    expect(b.limbSafety).toBeGreaterThanOrEqual(1);
  });
});

describe('proportions over the bind skeleton (pose.ts)', () => {
  it('paws stay on the ground, the trunk rises by the lift, the head rides the neck’s end', () => {
    // The failure this guards: a pose that lifts the feet off z = 0 or tears the head off the neck.
    expect(posePoint([1.1, 0.8, 0], 'body')[2]).toBe(0);
    expect(posePoint(SK.hind.ball, 'body')[2]).toBeCloseTo(SK.hind.ball[2], 9);
    const hip = posePoint(SK.hind.hip, 'body');
    expect(hip[2] - SK.hind.hip[2]).toBeCloseTo(PROPORTIONS.lift, 9);
    expect(hip[0]).toBeCloseTo(SK.hind.hip[0], 9);
    // The neck's end as a body point and the head joint as a head point land on the same spot.
    const end = posePoint(SK.head.joint, 'body');
    const joint = posePoint(SK.head.joint, 'head');
    for (let k = 0; k < 3; k++) expect(end[k] ?? 0).toBeCloseTo(joint[k] ?? 1, 9);
    // The neck is `neck` × as long, base to end.
    const base = SK.neck[0] ?? [0, 0, 0];
    const len = (a: readonly number[], b: readonly number[]): number =>
      Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[2] ?? 0) - (b[2] ?? 0));
    expect(len(end, posePoint(base, 'body')) / len(SK.head.joint, base)).toBeCloseTo(
      PROPORTIONS.neck,
      6,
    );
    // A wing is carried rigidly: lifted, not stretched along the neck.
    expect(posePoint(SK.wing.wrist, 'rigid')[0]).toBe(SK.wing.wrist[0]);
  });
});

describe('appendages grow out of the body', () => {
  it('the membrane roots on the flank: every flank point within 2 cm of the body surface', () => {
    const f = bodyField(1);
    for (const p of flankLine(0.015)) expect(Math.abs(f(p))).toBeLessThanOrEqual(0.02);
  });

  it('a main-horn boss stays on its own side: never across the crown into its twin', () => {
    // QA connections caught the two boss pieces running into each other over the midline.
    const { boss } = mainHornRoot();
    const across: [number, number, number] = [boss[0] + 0.09, -0.01, boss[2] - 0.05];
    expect(bossRegion(0.03, 1)(across)).toBeGreaterThan(0);
    expect(bossRegion(0.03, -1)([across[0], 0.01, across[2]])).toBeGreaterThan(0);
    expect(bossRegion(0.03, 1)(boss)).toBeLessThan(0);
  });

  it('a horn root sits buried at least half its radius inside the skull', () => {
    const { root, radius } = mainHornRoot();
    const skull = sculptField(headEdits(1), { color: C.flank }).field;
    expect(skull(root)).toBeLessThan(-0.5 * radius);
  });

  it(
    'wings touch their shoulder sockets and horns their bosses, at every LOD',
    () => {
      for (const s of ['l', 'r']) {
        assertTouches(dragon, `wing_${s}_arm`, `shoulder_${s}`, { lods: [1, 2] });
        assertTouches(dragon, `horn_${s}`, `horn_boss_${s}`, { lods: [1, 2] });
      }
    },
    SLOW,
  );

  it('no undeclared gaps (LOD1)', () => assertNoGaps(dragon, { lods: [1] }), SLOW);

  it(
    'every piece is rooted and every fold blended or declared (QA connections, LOD0)',
    () => assertConnected(dragon),
    SLOW,
  );
});

describe('LOD', () => {
  it(
    'LOD2 keeps ≥ 90% of the LOD0 outline from the front and the side',
    () => {
      assertLodSilhouette(dragon, 0.9, { views: ['+X', '-Y'] });
    },
    SLOW,
  );
});

describe('VDM detail (stamps.ts)', () => {
  const placesOf = (edits: readonly SculptEdit[]): { scale: number; depth?: number }[] =>
    edits.flatMap((e) => ('vdm' in e ? e.places : []));

  it(
    'LOD2 carries no stamps; LOD1 only the big ones, shallower; LOD0 the full grade',
    () => {
      expect(bodyStamps(2, bodyField(2)).edits).toEqual([]);
      const s0 = placesOf(bodyStamps(0, bodyField(0)).edits);
      const s1 = placesOf(bodyStamps(1, bodyField(1)).edits);
      expect(s0.length).toBeGreaterThan(150);
      expect(s1.length).toBeGreaterThan(0);
      expect(s1.length).toBeLessThan(s0.length / 2);
      const deepest = (s: { depth?: number }[]) => Math.max(...s.map((q) => q.depth ?? 0));
      expect(deepest(s1)).toBeLessThan(deepest(s0));
      // Graded: the biggest scales at least 1.5× the smallest.
      const sizes = s0.map((q) => q.scale);
      expect(Math.max(...sizes) / Math.min(...sizes)).toBeGreaterThan(1.5);
      // None crosses the folded midline (it would crease).
      for (const e of bodyStamps(0, bodyField(0)).edits)
        if ('vdm' in e) for (const q of e.places) expect(q.at[1]).toBeGreaterThan(q.scale * 0.7);
    },
    SLOW,
  );

  it('every off-midline horn grows from a ringed collar at LOD0 and LOD1, none at LOD2', () => {
    const head = sculptField(headEdits(0), { color: C.flank }).field;
    expect(placesOf(hornCollars(0, head)).length).toBe(4);
    expect(placesOf(hornCollars(1, head)).length).toBe(4);
    expect(hornCollars(2, head)).toEqual([]);
  });
});
