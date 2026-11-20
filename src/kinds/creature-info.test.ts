// What the kind hands a recipe that grooms its own coat: spec-level card counts reach the fur
// passes, and `info.rig` + `info.bare` let a recipe grow and skin head fur with the kind's own
// functions instead of re-implementing them.

import { describe, expect, it } from 'bun:test';
import { compile, createRng, dmath, type Mesh, place, Ts23dError } from '../core/index.ts';
import { sculptField } from '../primitives/index.ts';
import { type CreatureInfo, defineCreature } from './creature.ts';
import { v3 } from './creature-curve.ts';
import { headLayout } from './creature-head.ts';
import { creatureHeadFur } from './creature-head-fur.ts';
import { EAR_UP, earEdits } from './creature-head-parts.ts';
import { bonesOf } from './creature-skeleton.ts';
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
      const d = dmath.hypot(
        (cards.positions[i] ?? 0) - info.bare.nose[0],
        Math.abs(cards.positions[i + 1] ?? 0) - Math.abs(info.bare.nose[1]),
        (cards.positions[i + 2] ?? 0) - info.bare.nose[2],
      );
      expect(d).toBeGreaterThan(info.bare.noseR * 0.5);
    }
  }, 120_000);
});

describe('face.earWidth', () => {
  /** Width of the left ear blade at half its height, metres (sampled across the blade). */
  const earSpan = (earWidth?: number): number => {
    const spec: CreatureSpec = {
      ...WOLF,
      face: { ears: 'erect', ...(earWidth ? { earWidth } : {}) },
    };
    const l = headLayout(bonesOf(spec), spec);
    const f = sculptField(earEdits(l, spec, 0.004, false), { color: [1, 1, 1] }).field;
    const mid = v3.add(l.ear ?? [0, 0, 0], v3.mul(EAR_UP, 0.5 * l.earHeight));
    // The blade faces forward-out; its width runs along up × face.
    const face = v3.norm([1, 0.45, 0]);
    const side = v3.norm(v3.cross(EAR_UP, face));
    let inside = 0;
    for (let i = -400; i <= 400; i++) if (f(v3.add(mid, v3.mul(side, i * 0.0005))) < 0) inside++;
    return inside * 0.0005;
  };

  it('refuses a width outside 0.5..2, naming the field', () => {
    expect(() => checkCreature({ ...WOLF, face: { earWidth: 3 } })).toThrow('face.earWidth');
  });

  it('1.4 makes the blade about 1.4× as wide at mid height; 1 is the default blade', () => {
    const base = earSpan();
    expect(base).toBeGreaterThan(0.01);
    expect(earSpan(1)).toBe(base);
    const wide = earSpan(1.4) / base;
    expect(wide).toBeGreaterThan(1.25);
    expect(wide).toBeLessThan(1.55);
  });
});

describe('options.head: a recipe sculpts its own forms on the head', () => {
  /** Top of the head part's mesh in its own frame, metres, and the head length. */
  const crown = (dome: boolean): number => {
    let info: CreatureInfo | undefined;
    const asset = defineCreature({
      name: 'domed',
      spec: { ...WOLF, cards: false, face: { ears: 'none' } },
      options: dome
        ? {
            head: (l) => [
              {
                shape: 'ellipsoid',
                at: [0.4 * l.lc, 0, 0.5 * l.H],
                size: [0.3 * l.lc, 0.3 * l.W, 0.5 * l.H],
                blend: 0.1 * l.L,
              },
            ],
          }
        : {},
      extra: (_ctx, i) => {
        info = i;
      },
    });
    const head = compile(asset, { lod: 1 }).parts.find((p) => p.name === 'head')?.mesh;
    expect(info).toBeDefined();
    let top = -Infinity;
    for (let i = 2; i < (head?.positions.length ?? 0); i += 3)
      top = Math.max(top, head?.positions[i] ?? 0);
    return top / (info?.head.H ?? 1);
  };

  it('a dome over the braincase raises the crown; without the hook the head is the kind’s', () => {
    const plain = crown(false);
    expect(crown(true)).toBeGreaterThan(plain + 0.3);
  });
});

describe('options.body: a recipe sculpts its own forms on the body', () => {
  /** Widest |y| of the body mesh within 3 cm of the left stifle's height and x. */
  const atStifle = (bump: boolean, lods: number[] = []): { left: number; right: number } => {
    const spec: CreatureSpec = { ...WOLF, cards: false };
    const asset = defineCreature({
      name: 'landmarked',
      spec,
      options: bump
        ? {
            body: (b, lod) => {
              lods.push(lod);
              const K = b.legs.find((l) => l.name === 'hind')?.joints[1] ?? [0, 0, 0];
              // A patella knob proud of the outer stifle, left side (the sculpt mirrors it).
              return [{ shape: 'sphere', at: [K[0], K[1] + 0.05, K[2]], size: 0.03, blend: 0.01 }];
            },
          }
        : {},
    });
    const body = compile(asset, { lod: 1 }).parts.find((p) => p.name === 'body')?.mesh;
    const K = bonesOf(checkCreature(spec)).legs.find((l) => l.name === 'hind')?.joints[1];
    if (!body || !K) throw new Error('no body or stifle');
    let [left, right] = [0, 0];
    const P = body.positions;
    for (let i = 0; i < P.length; i += 3)
      if (Math.abs((P[i] ?? 0) - K[0]) < 0.03 && Math.abs((P[i + 2] ?? 0) - K[2]) < 0.03) {
        left = Math.max(left, P[i + 1] ?? 0);
        right = Math.max(right, -(P[i + 1] ?? 0));
      }
    return { left, right };
  };

  it('a knob on the stifle stands proud on both sides; without the hook the body is the kind’s', () => {
    const lods: number[] = [];
    const plain = atStifle(false);
    const knob = atStifle(true, lods);
    expect(knob.left).toBeGreaterThan(plain.left + 0.02);
    expect(knob.right).toBeGreaterThan(plain.right + 0.02);
    // The hook is told the LOD: the far legs are tubes outside the sculpt.
    expect(lods).toEqual([1]);
  }, 120_000);
});
