// The far-LOD hair measures (D585–D589) on hand-built parts: a card standing off the skin reads
// its height, one lying on it a few mm; a look from outside meets the cards where they cover the
// head and the skin where they do not, in the colour it meets. And the hair shell grows by a
// thickness field, not only a constant.

import { describe, expect, it } from 'bun:test';
import { dmath, type Mesh, sculptField, type Vec3 } from '@developerz.ai/ts23d';
import { cardStandoff, hairLook, hairMass, type PartsOf, quantile } from './hair.ts';

/** One quad a → b → c → d, flat-coloured. */
function quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Vec3): Mesh {
  return {
    positions: Float32Array.from([...a, ...b, ...c, ...d]),
    normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array(8),
    colors: Float32Array.from([...color, ...color, ...color, ...color]),
    indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
  };
}

const SKIN: Vec3 = [0.8, 0.6, 0.5];
const HAIR: Vec3 = [0.1, 0.05, 0.02];
/** A 20 cm square of skin at z = 0. */
const head = quad([-0.1, -0.1, 0], [0.1, -0.1, 0], [0.1, 0.1, 0], [-0.1, 0.1, 0], SKIN);
const asset = (...hair: Mesh[]): PartsOf => ({
  parts: [
    { name: 'head', mesh: head, at: [0, 0, 0] },
    ...hair.map((mesh, i) => ({
      name: i === 0 ? 'hair' : `eye_${i}`,
      mesh,
      at: [0, 0, 0] as Vec3,
    })),
  ],
});

describe('cardStandoff', () => {
  it('reads a card standing 3 cm off the skin as 3 cm', () => {
    const shard = quad([0, -0.01, 0], [0, 0.01, 0], [0, 0.01, 0.03], [0, -0.01, 0.03], HAIR);
    const d = cardStandoff(asset(shard));
    expect(quantile(d, 1)).toBeCloseTo(0.03, 4);
  });

  it('reads a card lying 2 mm over the skin as 2 mm', () => {
    const flat = quad(
      [0, -0.01, 0.002],
      [0.04, -0.01, 0.002],
      [0.04, 0.01, 0.002],
      [0, 0.01, 0.002],
      HAIR,
    );
    const d = cardStandoff(asset(flat));
    expect(quantile(d, 1)).toBeCloseTo(0.002, 4);
  });

  it('measures against every other part but the eyes', () => {
    const flat = quad(
      [0, -0.01, 0.05],
      [0.04, -0.01, 0.05],
      [0.04, 0.01, 0.05],
      [0, 0.01, 0.05],
      HAIR,
    );
    const eye = quad(
      [0, -0.01, 0.051],
      [0.04, -0.01, 0.051],
      [0.04, 0.01, 0.051],
      [0, 0.01, 0.051],
      SKIN,
    );
    expect(quantile(cardStandoff(asset(flat, eye)), 1)).toBeCloseTo(0.05, 4);
  });
});

describe('hairLook', () => {
  const o = { centre: [0, 0, -0.05] as Vec3, line: () => -1, rays: 400 };

  it('meets bare skin where no card covers the head', () => {
    const look = hairLook(asset(), o);
    expect(look.rays).toBeGreaterThan(20);
    expect(look.cards).toBe(0);
    expect(look.color[0]).toBeCloseTo(SKIN[0], 4);
  });

  it('meets the cards, in their colour, where they cover it', () => {
    // (A little wider than the head: a grazing ray must not slip under its edge.)
    const cap = quad(
      [-0.12, -0.12, 0.004],
      [0.12, -0.12, 0.004],
      [0.12, 0.12, 0.004],
      [-0.12, 0.12, 0.004],
      HAIR,
    );
    const look = hairLook(asset(cap), o);
    expect(look.cards).toBe(1);
    expect(look.color[0]).toBeCloseTo(HAIR[0], 4);
  });

  it('counts only hits inside the hairline', () => {
    const look = hairLook(asset(), { ...o, line: () => 1 });
    expect(look.rays).toBe(0);
  });
});

describe('hairMass', () => {
  // A ball of skull, radius 10 cm, hair everywhere above z = 0.
  const scalp = (p: Vec3): number => dmath.hypot(p[0], p[1], p[2]) - 0.1;
  const region = (p: Vec3): number => -p[2] - 0.05;
  const box: [Vec3, Vec3] = [
    [-0.2, -0.2, -0.2],
    [0.2, 0.2, 0.2],
  ];
  const top = (thick: number | ((p: Vec3) => number)): number => {
    const f = sculptField([hairMass(scalp, thick, region, box, HAIR, 0.01)], { color: HAIR }).field;
    // Walk up the z axis to the surface.
    let z = 0.1;
    while (f([0, 0, z]) < 0) z += 0.0002;
    return z - 0.1;
  };

  it('grows by a constant thickness', () => {
    expect(top(0.008)).toBeCloseTo(0.0084, 3);
  });

  it('grows by a thickness field (the far shell, thicker at the back)', () => {
    expect(top((p) => (p[2] > 0.09 ? 0.015 : 0.008))).toBeCloseTo(0.0154, 3);
  });
});
