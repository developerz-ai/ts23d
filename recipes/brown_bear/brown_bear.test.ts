// The brown bear's own tests: sourced numbers on the skeleton familyMember built from the wolf,
// the ursid swap (plantigrade, five toes on every foot), Wikidata's mass recorded as a cross-check,
// and the plantigrade gait: before gait-swing knew a sole from a paw, the fore sole sank 17 cm.

import { describe, expect, it } from 'bun:test';
import { compile, creaturePlan, dmath, gaitFindings, type Vec3 } from '@developerz.ai/ts23d';
import { BEAR, brown_bear, MASS_CONFLICTS, REAL, WIKIDATA_MASS } from './brown_bear.ts';
import { earDisc } from './head.ts';

const SLOW = 120_000;
const dist = (a: Vec3, b: Vec3): number => dmath.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('Eurasian brown bear from the wolf family (Wikipedia: Brown bear; Wikidata Q36341)', () => {
  const { bones } = creaturePlan(BEAR);

  it('head + body 2.05 m (±2 %), plantigrade, five toes on every foot', () => {
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

describe('the bear’s own head forms (head.ts)', () => {
  const { bones } = creaturePlan(BEAR);
  it(
    'the ears stand off the skull as discs, reaching well past the crown above the ear line',
    () => {
      const head = compile(brown_bear, { lod: 1 }).parts.find((p) => p.name === 'head')?.mesh;
      const h = bones.head;
      const lc = (1 - (BEAR.face?.muzzle ?? 0)) * h.length;
      const ear = earDisc({ L: h.length, W: h.width, H: h.height, lc });
      // Head part frame: pitched about the atlas; the ear centre keeps its y.
      let top = 0;
      let cheeks = 0;
      const P = head?.positions ?? new Float32Array();
      const [c, s] = [dmath.cos(h.pitch), dmath.sin(h.pitch)];
      for (let i = 0; i < P.length; i += 3) {
        const z = s * (P[i] ?? 0) + c * (P[i + 2] ?? 0);
        const y = Math.abs(P[i + 1] ?? 0);
        if (z > ear.at[2]) top = Math.max(top, y);
        else if (z > 0) cheeks = Math.max(cheeks, y);
      }
      // Without the discs nothing above the ear line reaches past the crown (≈ 0.3 W).
      expect(top).toBeGreaterThan(ear.at[1] + ear.r * 0.6);
      expect(top).toBeGreaterThan(h.width * 0.45);
      expect(cheeks).toBeGreaterThan(0);
    },
    SLOW,
  );
});
