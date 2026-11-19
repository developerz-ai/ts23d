// What the kind hands a recipe that grooms its own coat: spec-level card counts reach the fur
// passes, and `info.rig` + `info.bare` let a recipe grow and skin head fur with the kind's own
// functions instead of re-implementing them.

import { describe, expect, it } from 'bun:test';
import { compile, createRng, type Mesh, place, Ts23dError } from '../core/index.ts';
import { type CreatureInfo, defineCreature } from './creature.ts';
import { creatureHeadFur } from './creature-head-fur.ts';
import { type CreatureSpec, checkCreature } from './creature-spec.ts';

const WOLF: CreatureSpec = {
  skeleton: 'quadruped',
  family: 'canid',
  mass: 40,
  length: 1.15,
  height: 0.8,
  colours: {
    coat: [0.4, 0.35, 0.3],
    nose: [0.02, 0.02, 0.02],
    iris: [0.6, 0.4, 0.1],
    keratin: [0.1, 0.09, 0.08],
  },
};

const tris = (m: Mesh | null | undefined): number => (m ? m.indices.length / 3 : 0);

describe('spec-level fur density', () => {
  it('refuses a card count that is not positive, naming the field', () => {
    for (const fur of [{ density: 0 }, { guard: -5 }]) {
      expect(() => checkCreature({ ...WOLF, fur })).toThrow(Ts23dError);
      expect(() => checkCreature({ ...WOLF, fur })).toThrow('fur.');
    }
  });

  it('half the undercoat and guard counts grow about half the cards, body and head', () => {
    const cards = (fur?: CreatureSpec['fur']): [number, number] => {
      const c = compile(
        defineCreature({ name: 'furred', spec: { ...WOLF, ...(fur ? { fur } : {}) } }),
        {
          lod: 1,
        },
      );
      const of = (name: string): number => tris(c.parts.find((p) => p.name === name)?.mesh);
      return [of('fur'), of('head_fur')];
    };
    const [body, head] = cards();
    const [halfBody, halfHead] = cards({ density: 900, guard: 260 });
    expect(body).toBeGreaterThan(1000);
    expect(halfBody / body).toBeGreaterThan(0.4);
    expect(halfBody / body).toBeLessThan(0.6);
    expect(halfHead / head).toBeGreaterThan(0.35);
    expect(halfHead / head).toBeLessThan(0.65);
  }, 120_000);
});

describe('grooming with the kind’s rig', () => {
  it('a recipe grows head fur from info.bare and skins it with info.rig, piece by piece', () => {
    const seen: CreatureInfo[] = [];
    const asset = defineCreature({
      name: 'self_groomed',
      spec: { ...WOLF, cards: false },
      extra: (_ctx, info) => void seen.push(info),
    });
    const c = compile(asset, { lod: 1 });
    const info = seen[0];
    if (!info) throw new Error('extra did not run');
    expect(c.parts.map((p) => p.name)).not.toContain('head_fur');
    // The head part is pitched about the atlas: back to head-local, then the kind's own pass.
    const part = c.parts.find((p) => p.name === info.parts.head)?.mesh;
    if (!part) throw new Error('no head mesh');
    const pitch = info.bones.head.pitch;
    const local = place(part, { pitch: -pitch });
    const cards = creatureHeadFur(local, WOLF, info.bare, {
      lod: 1,
      rng: createRng(7),
    });
    expect(tris(cards)).toBeGreaterThan(100);
    if (!cards) return;
    const skinned = info.rig.pieces(place(cards, { pitch }), 'head', info.bones.head.atlas);
    expect(skinned.joints?.length).toBe((skinned.positions.length / 3) * 4);
    // Rigid per card: the four vertices of a card's first quad share one set of joints.
    const j = skinned.joints ?? new Uint16Array();
    expect([...j.slice(0, 4)]).toEqual([...j.slice(4, 8)]);
    // No card on the nose leather.
    for (let i = 0; i < cards.positions.length; i += 3) {
      const d = Math.hypot(
        (cards.positions[i] ?? 0) - info.bare.nose[0],
        Math.abs(cards.positions[i + 1] ?? 0) - Math.abs(info.bare.nose[1]),
        (cards.positions[i + 2] ?? 0) - info.bare.nose[2],
      );
      expect(d).toBeGreaterThan(info.bare.noseR * 0.5);
    }
  }, 120_000);
});
