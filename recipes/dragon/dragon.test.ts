// Cinderhorn's own tests: the biology README.md argues from, appendages that grow out of the body
// (wings, horns), the membrane fused to the flank, and LOD2 keeping LOD0's outline. Heavy (LOD0
// compiles): run with `bun test recipes/dragon`.

import { describe, expect, it } from 'bun:test';
import { compile, sculptField } from '@developerz.ai/ts23d';
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
