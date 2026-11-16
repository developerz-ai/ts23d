import { describe, expect, it } from 'bun:test';
import { hex, sculptField } from '@developerz.ai/ts23d';
import { ELF_BUST } from '../../elf_head/build.ts';
import { coveredArea as elfCovered } from '../../elf_head/clothes.ts';
import { GOBLIN_BUST } from '../../goblin_head/build.ts';
import { coveredArea as goblinCovered } from '../../goblin_head/clothes.ts';
import { HUMAN_BUST } from '../../human_head/build.ts';
import { type BustRecipe, bustEdits } from './bust.ts';
import { skinShowing } from './cloth-check.ts';
import { cloth } from './cloth-garment.ts';
import { coveredArea as humanCovered } from './human/clothes.ts';
import { surface, type V } from './kit.ts';

const SKIN = hex('#d4986f');
const ball = (p: V): number => Math.hypot(p[0], p[1], p[2]) - 0.1;
const box: [V, V] = [
  [-0.12, -0.12, -0.12],
  [0.12, 0.12, 0.12],
];
const top = (p: V): number => 0.03 - p[2];

describe('no skin through the cloth', () => {
  it('finds skin where cloth is declared but missing (a paint-only or too-thin garment)', () => {
    const s = sculptField([{ field: ball, bounds: box }], { color: SKIN });
    const bare = skinShowing({
      ...s,
      skin: surface(ball),
      covered: top,
      tone: SKIN,
      box,
      step: 0.02,
    });
    expect(bare.length).toBeGreaterThan(5);
  });
  it('passes when a garment covers the declared area', () => {
    const coat = cloth(
      { body: ball, thick: 0.004, region: top },
      { bounds: box, color: [0, 0, 1] },
    );
    const s = sculptField([{ field: ball, bounds: box }, coat], { color: SKIN });
    expect(
      skinShowing({
        ...s,
        skin: surface(ball),
        covered: (p) => top(p) + 0.01,
        tone: SKIN,
        box,
        step: 0.02,
      }),
    ).toEqual([]);
  });
  const busts: Array<[string, BustRecipe, (skin: (p: V) => number) => (p: V) => number]> = [
    ['human', HUMAN_BUST, humanCovered],
    ['elf', ELF_BUST, elfCovered],
    ['goblin', GOBLIN_BUST, goblinCovered],
  ];
  for (const [name, b, covered] of busts)
    it(`${name}: the outer surface is cloth wherever the outfit declares it`, () => {
      const { edits, skin } = bustEdits(b, 4, 1);
      const s = sculptField(edits, { color: b.spec.skin, mirror: 'y' });
      const l = b.l;
      const bare = skinShowing({
        ...s,
        skin,
        covered: covered(skin.field),
        tone: b.spec.skin,
        box: [
          [-0.2, 0, b.torso.cutZ],
          [0.2, 0.3, l.mz],
        ],
        step: 0.01,
      });
      expect(bare.map((p) => p.map((v) => v.toFixed(3)).join(','))).toEqual([]);
    }, 120000);
  it('goblin: the shoulder fronts beside the scarf are declared cloth, not bare (D61)', () => {
    const { skin } = bustEdits(GOBLIN_BUST, 2, 1);
    const covered = goblinCovered(skin.field);
    // March in from the front onto the shoulder front, 9–14 cm out (past the scarf), 2 cm under it.
    for (const y of [0.09, 0.12, 0.14]) {
      let x = 0.3;
      for (let d = skin.field([x, y, 0.2]); d > 0.0005 && x > -0.2; d = skin.field([x, y, 0.2]))
        x -= Math.max(0.0008, d * 0.8);
      expect(covered([x, y, 0.2])).toBeLessThan(0);
    }
  });
});
