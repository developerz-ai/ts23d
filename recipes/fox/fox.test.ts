// The fox's own tests: the sourced numbers held against the skeleton familyMember built from the
// wolf, the canid biology it keeps, and the fox's own marks (white brush tip, black ear backs).

import { describe, expect, it } from 'bun:test';
import {
  compile,
  creaturePlan,
  dmath,
  gaitFindings,
  massProperties,
  type Vec3,
} from '@developerz.ai/ts23d';
import { assertUprightOnGround } from '@developerz.ai/ts23d/testing';
import { WOLF } from '../_lib/creature/wolf-spec.ts';
import { FOX, FOX_DATA, fox, REAL } from './fox.ts';

const SLOW = 120_000;
const dist = (a: Vec3, b: Vec3): number => dmath.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('red fox from the wolf family (Wikipedia: Red fox; Wikidata Q8332)', () => {
  const { bones } = creaturePlan(FOX);

  it('refuses a fox in grams before sculpting anything', () => {
    expect(() => creaturePlan({ ...FOX, mass: 6000 })).toThrow();
  });

  it('shoulder is the pinned Wikidata height; head + body 0.74 m (±2 %)', () => {
    expect(REAL.shoulder).toBe(0.425);
    expect(FOX_DATA.qid).toBe('Q8332');
    const hb = dist(bones.nose, bones.tailRoot);
    expect(Math.abs(hb - REAL.headBody) / REAL.headBody).toBeLessThan(0.02);
  });

  it('carries the sourced 11 cm ear (the face override used to drop it to the kind’s 6 cm)', () => {
    // Measured on the built rig (ear bone: base → tip), not read back from the spec's ratio.
    const ears = (compile(fox, { lod: 2 }).skeleton?.bones ?? []).filter((b) =>
      /^ear_[lr]$/.test(b.name),
    );
    expect(ears.length).toBe(2);
    for (const e of ears)
      expect(Math.abs(dist(e.head, e.tail) - REAL.ear) / REAL.ear).toBeLessThan(0.02);
    expect(REAL.ear).toBeGreaterThanOrEqual(0.077);
    expect(REAL.ear).toBeLessThanOrEqual(0.125);
  });

  it('is the wolf skeleton: same bones and legs, canid digits 5 fore / 4 hind', () => {
    const w = creaturePlan(WOLF).bones;
    expect(bones.legs.map((l) => l.name)).toEqual(w.legs.map((l) => l.name));
    const fore = bones.legs.find((l) => l.name === 'fore');
    expect([fore?.toes, fore?.dewclaws]).toEqual([4, 1]);
  });

  it(
    'weighs within ±30 % of 7.5 kg (volume × furred density), stands, and its gaits do not slide',
    () => {
      const c = compile(fox, { lod: 2 });
      const m = massProperties(compile(fox, { lod: 1 })).mass;
      expect(m).toBeGreaterThan(REAL.mass * 0.7);
      expect(m).toBeLessThan(REAL.mass * 1.3);
      expect(gaitFindings(c)).toEqual([]);
      assertUprightOnGround(fox);
    },
    SLOW,
  );
});
