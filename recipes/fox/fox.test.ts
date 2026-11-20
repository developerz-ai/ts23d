// The fox's own tests: the sourced numbers held against the skeleton familyMember built from the
// wolf, the canid biology it keeps, and the fox's own marks (white brush tip, black ear backs).

import { describe, expect, it } from 'bun:test';
import {
  type CreatureInfo,
  compile,
  creaturePlan,
  dmath,
  gaitFindings,
  massProperties,
  type Vec3,
} from '@developerz.ai/ts23d';
import { assertUprightOnGround } from '@developerz.ai/ts23d/testing';
import { defineWildCreature } from '../_lib/creature/wild.ts';
import { WOLF } from '../_lib/creature/wolf-spec.ts';
import { FOX, FOX_DATA, FOX_WILD, fox, REAL } from './fox.ts';

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

  it(
    'paints the white brush tip on the far body (the LOD2 colour blocks once overwrote it)',
    () => {
      const seen: CreatureInfo[] = [];
      const spy = defineWildCreature(
        { name: 'fox_tip', spec: FOX },
        {
          ...FOX_WILD,
          base: (i) => {
            seen.push(i);
            const own = FOX_WILD.base?.(i);
            if (!own) throw new Error('FOX_WILD has no base paint');
            return own;
          },
        },
      );
      compile(spy, { lod: 2 });
      const got = seen[0];
      if (!got) throw new Error('base paint never built');
      const paint = FOX_WILD.base?.(got);
      if (!paint) throw new Error('FOX_WILD has no base paint');
      const end = got.bones.tail[got.bones.tail.length - 1]?.at;
      if (!end) throw new Error('no tail');
      const coat = FOX.colours.coat;
      const tip = FOX.colours.tailTip ?? coat;
      const off = (c: Vec3): number => dmath.hypot(c[0] - tip[0], c[1] - tip[1], c[2] - tip[2]);
      for (const n of [
        [0, 0, 1],
        [0, 1, 0],
        [0, 0, -1],
      ] as Vec3[]) {
        const c = paint({ p: end, n, c: coat, lod: 2, part: 'body' });
        expect(off(c)).toBeLessThan(0.05);
      }
    },
    SLOW,
  );
});
