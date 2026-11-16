// The brown bear's own tests: sourced numbers on the skeleton familyMember built from the wolf,
// the ursid swap (plantigrade, five toes on every foot), Wikidata's mass recorded as a cross-check,
// and the plantigrade gait: before gait-swing knew a sole from a paw, the fore sole sank 17 cm.

import { describe, expect, it } from 'bun:test';
import { compile, creaturePlan, gaitFindings, type Vec3 } from '@developerz.ai/ts23d';
import { BEAR, brown_bear, MASS_CONFLICTS, REAL, WIKIDATA_MASS } from './brown_bear.ts';

const SLOW = 120_000;
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('Eurasian brown bear from the wolf family (Wikipedia: Brown bear; Wikidata Q36341)', () => {
  const { bones } = creaturePlan(BEAR);

  it('head + body 2.1 m (±2 %), plantigrade, five toes on every foot', () => {
    expect(Math.abs(dist(bones.nose, bones.tailRoot) - REAL.headBody) / REAL.headBody).toBeLessThan(
      0.02,
    );
    expect(bones.stance).toBe('plantigrade');
    for (const l of bones.legs) expect([l.toes, l.dewclaws]).toEqual([5, 0]);
  });

  it('Wikidata mass (500 kg, no qualifier) agrees with the declared 400 kg within 25 %', () => {
    expect(WIKIDATA_MASS).toBe(500);
    expect(MASS_CONFLICTS).toEqual([]);
  });

  it(
    'walks, trots and gallops without the sole sinking or sliding (plantigrade swing)',
    () => {
      const c = compile(brown_bear, { lod: 2 });
      expect(c.clips?.map((k) => k.name)).toContain('walk');
      expect(gaitFindings(c)).toEqual([]);
    },
    SLOW,
  );
});
