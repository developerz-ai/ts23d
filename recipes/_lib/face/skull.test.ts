import { describe, expect, it } from 'bun:test';
import { MeshBuilder, type Vec3 } from '@developerz.ai/ts23d';
import { exactField } from './mesh-exact.ts';
import { HUMAN_PROPORTIONS, measureHead, proportionFindings } from './proportions.ts';
import { type SkullLandmarks, skullEdit, skullLandmarks, skullOf } from './skull.ts';
import { type Character, HUMAN } from './spec.ts';

const who: Character = {
  race: HUMAN,
  age: 0.3,
  weight: 0,
  asym: 0,
  tone: {
    base: [0.8, 0.6, 0.5],
    flush: [0.8, 0.5, 0.4],
    lips: [0.7, 0.4, 0.4],
    cool: [0.6, 0.5, 0.5],
    cavity: [0.3, 0.2, 0.2],
  },
  eyes: { iris: [0.3, 0.4, 0.5] },
  mouth: 0,
};
const FRAME = { H: 0.23, glabella: [0.1, 0, 0.45] as Vec3 };

/** A closed cube of half-size h with a closed cube void of half-size v inside it. */
function hollowCube(h: number, v: number) {
  const b = new MeshBuilder();
  const box = (s: number, flip: boolean): void => {
    const c: Vec3[] = [];
    for (const z of [-s, s]) for (const y of [-s, s]) for (const x of [-s, s]) c.push([x, y, z]);
    const ids = c.map((p) => b.vertex({ p, n: [0, 0, 1], uv: [0, 0], color: [1, 1, 1] }));
    const faces = [
      [0, 2, 3, 1],
      [4, 5, 7, 6],
      [0, 1, 5, 4],
      [2, 6, 7, 3],
      [0, 4, 6, 2],
      [1, 3, 7, 5],
    ];
    for (const f of faces) {
      const [a = 0, bb = 0, cc = 0, d = 0] = f.map((i) => ids[i] ?? 0);
      if (flip) b.tri(a, cc, bb).tri(a, d, cc);
      else b.tri(a, bb, cc).tri(a, cc, d);
    }
  };
  box(h, false);
  box(v, true);
  return b.build();
}

describe('exact mesh field', () => {
  it('fails the void case without filling: a sealed void reads as outside', () => {
    const f = exactField(hollowCube(0.05, 0.02), 0.004, 3, {}).field;
    expect(f([0, 0, 0])).toBeGreaterThan(0);
  });
  it('fills a sealed void and measures distance to the outer skin only', () => {
    const f = exactField(hollowCube(0.05, 0.02), 0.004, 3, { fillVoids: true }).field;
    expect(f([0, 0, 0])).toBeLessThan(-0.04);
    // Outside: a true distance, continuous past the grid's wall.
    expect(f([0.08, 0, 0])).toBeCloseTo(0.03, 2);
    expect(f([0.3, 0, 0])).toBeCloseTo(0.25, 2);
  });
});

describe('skull stage', () => {
  const s = skullOf(who, FRAME);
  const k = skullLandmarks(s);
  it('places the head in the frame: glabella on the frame, menton → crown = H', () => {
    expect(k.glabella[0]).toBeCloseTo(0.1, 6);
    expect(k.crown[2] - k.menton[2]).toBeCloseTo(0.23, 6);
  });
  it('is deterministic and closed: inside the cranium, outside in front of the face', () => {
    const cut = { at: [0, 0, k.menton[2] - 0.1] as Vec3, normal: [-0.3, 0, -1] as Vec3 };
    const e = skullEdit(s, { cell: 0.004, fine: false, cut, color: [1, 1, 1] });
    if (!('field' in e)) throw new Error('skull edit is a field edit');
    const mid: Vec3 = [(k.glabella[0] + k.occiput[0]) / 2, 0, k.eye[2] + 0.03];
    expect(e.field(mid)).toBeLessThan(-0.03);
    expect(e.field([k.pronasale[0] + 0.02, 0, k.pronasale[2]])).toBeGreaterThan(0.015);
    // The sealed mouth's cavity is filled: just behind the lips is inside.
    expect(e.field([k.stomion[0] - 0.02, 0, k.stomion[2]])).toBeLessThan(0);
  });
});

describe('head proportions', () => {
  const k = skullLandmarks(skullOf(who, FRAME));
  // A skin with a 12 cm neck (radius 6 cm round the neck axis) and nothing else.
  const neck = (r: number) => (p: Vec3) =>
    Math.hypot(p[0] - (k.throat[0] + k.nape[0]) / 2, p[1]) - r;
  const shift = (o: Partial<SkullLandmarks>): SkullLandmarks => ({ ...k, ...o });
  it('fails an eyeball pushed forward out of the orbit (the old bust) and a giraffe neck', () => {
    const forward = shift({ eye: [k.glabella[0] - k.eyeR, k.eye[1], k.eye[2]] });
    const found = proportionFindings(measureHead(forward, neck(0.075)), HUMAN_PROPORTIONS, 'old');
    const keys = found.map((f) => f.message.split(' ')[1]);
    expect(keys).toContain('neckWidth');
    expect(keys).toContain('eyeDepth');
  });
  it('flags the base short lower face; dropping the jaw 7 % H brings every ratio in band', () => {
    const base = proportionFindings(measureHead(k, neck(0.06)), HUMAN_PROPORTIONS, 'base');
    expect(base.map((f) => f.message.split(' ')[1])).toEqual(['noseThird']);
    const long: Character = { ...who, race: { ...HUMAN, jaw: { width: 1, drop: 0.07 } } };
    const k2 = skullLandmarks(skullOf(long, FRAME));
    const m = measureHead(k2, neck(0.055));
    expect(proportionFindings(m, HUMAN_PROPORTIONS, 'long')).toEqual([]);
  });
});
