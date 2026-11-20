import { describe, expect, it } from 'bun:test';
import { createRng, sculptField, type Vec3 } from '@developerz.ai/ts23d';
import { hairSculpt } from './hair.ts';
import { beardBody, moustacheOf } from './hair-beard.ts';
import { faceHead } from './head.ts';
import { LEFT, MIDLINE } from './landmarks.ts';
import { DWARF } from './races.ts';
import type { Character } from './spec.ts';

const dwarf: Character = {
  race: DWARF,
  age: 0,
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
};
const head = faceHead(dwarf, createRng(1));
const s = head.scale;
const root: Vec3 = [0.36, 0.16, 0.06];
const tip: Vec3 = [0.62, 0.34, 0.14];
const body = (lod: number) => sculptField(beardBody(head, root, tip, lod), { color: root }).field;

describe('face beard', () => {
  it('fails if the upper lip is bare under a full beard (D462): the moustache lies on it', () => {
    const sub = head.map(MIDLINE.subnasale);
    const lab = head.map(MIDLINE.labraleSup);
    const tache = moustacheOf(head);
    const near = body(0);
    for (const side of [1, -1]) {
      // In front of the upper lip, a third of the way out to the mouth's corner.
      const p: Vec3 = [lab[0] + 0.002 * s, side * 0.011 * s, (sub[2] + lab[2]) / 2];
      expect(near(p)).toBeLessThan(0);
      expect(tache([lab[0], p[1], p[2]])).toBeLessThan(0);
    }
  });

  it('fails if the far beard is separate sausages (D464): one spade between chin and jaw', () => {
    const pog = head.map(MIDLINE.pogonion);
    const men = head.map(MIDLINE.menton);
    const jaw = head.map(LEFT.jawline);
    const far = body(2);
    // Between the chin chain and a jaw chain, half way down the spade.
    const mid: Vec3 = [pog[0] - 0.012 * s, Math.abs(jaw[1]) * 0.45, men[2] - 0.05 * s];
    // At least half the far sculpt's 1.7 cm cell deep there, so the mesh holds it as one volume.
    expect(far(mid)).toBeLessThan(-0.0085 * s);
  });

  it('fails if the far beard is an egg on the chin (D478): notched lock tips and a moustache', () => {
    const pog = head.map(MIDLINE.pogonion);
    const men = head.map(MIDLINE.menton);
    const lab = head.map(MIDLINE.labraleSup);
    const sub = head.map(MIDLINE.subnasale);
    const far = body(2);
    const x = pog[0] - 0.01 * s;
    // The centre tip hangs lowest; beside it, at the side tips' height, a notch is open air.
    expect(far([x, 0, men[2] - 0.1 * s])).toBeLessThan(0);
    expect(far([x, 0.03 * s, men[2] - 0.082 * s])).toBeLessThan(0);
    expect(far([x, 0.016 * s, men[2] - 0.1 * s])).toBeGreaterThan(0);
    // A moustache mass stands in front of the upper lip at the far LOD's cell.
    expect(far([lab[0] + 0.004 * s, 0.014 * s, (lab[2] + sub[2]) / 2])).toBeLessThan(-0.004 * s);
    // Value bands: the tips are lighter than the dark root mass along the jaw.
    const edits = beardBody(head, root, tip, 2);
    const reds = edits.map((e) => ('color' in e ? (e.color?.[0] ?? 0) : 0)).filter((r) => r > 0);
    expect(Math.max(...reds) - Math.min(...reds)).toBeGreaterThan(0.15);
  });

  it('fails if the mass under the lock-style cards is as light as the far hair (D463)', () => {
    const st = { cut: 'short', root, tip } as const;
    const red = (lod: number): number => {
      const c = hairSculpt(head, st, lod)?.mesh.colors ?? new Float32Array(3);
      let m = 0;
      for (let i = 0; i < c.length; i += 3) m += c[i] ?? 0;
      return m / (c.length / 3);
    };
    // LOD0/1: the root colour in shadow (gaps between the locks read as depth); the far LOD,
    // which has no cards, keeps the brighter mid tone.
    expect(red(1)).toBeLessThan(red(2) * 0.75);
  });
});
