import { describe, expect, it } from 'bun:test';
import { createRng, type Vec3 } from '@developerz.ai/ts23d';
import { eyeball } from '../bust/eye.ts';
import { clothMask, garmentPaint, necklineOf } from './garment.ts';
import { faceHead } from './head.ts';
import { LEFT, MIDLINE } from './landmarks.ts';
import { skinFinish } from './skin-strip.ts';
import { HUMAN } from './spec.ts';

const head = faceHead(
  {
    race: HUMAN,
    age: 0,
    weight: 0,
    asym: 0,
    tone: {
      base: [0.66, 0.45, 0.33],
      flush: [0.74, 0.38, 0.31],
      lips: [0.6, 0.3, 0.27],
      cool: [0.52, 0.42, 0.42],
      cavity: [0.3, 0.17, 0.13],
    },
    eyes: { iris: [0.3, 0.4, 0.5] },
  },
  createRng(1),
);
const g = { cloth: [0.06, 0.2, 0.12], trim: [0.62, 0.46, 0.16] } as const;
const at = (q: readonly [number, number, number]): Vec3 => head.map(q);

describe('garment', () => {
  it('dresses the shoulders and the chest, never the face or the neck', () => {
    const line = necklineOf(head, g);
    // Cloth: the shoulder tip, the upper back, the chest below the breastbone's notch.
    for (const q of [LEFT.acromion, LEFT.back, LEFT.chest]) expect(line(at(q))).toBeLessThan(0);
    // Skin: the face, the jaw, the side of the neck, the nape.
    for (const q of [MIDLINE.pronasale, LEFT.gonion, LEFT.neck, MIDLINE.nape])
      expect(line(at(q))).toBeGreaterThan(0);
    const mask = clothMask(head, g);
    expect(mask(at(LEFT.chest))).toBe(1);
    expect(mask(at(MIDLINE.pronasale))).toBe(0);
  });

  it('paints the wool over the skin colour below the line and leaves the face alone', () => {
    const paint = garmentPaint(head, g, createRng(2));
    const skin: Vec3 = [0.66, 0.45, 0.33];
    const up: Vec3 = [0, 0, 1];
    expect(paint(at(MIDLINE.pronasale), [1, 0, 0], skin)).toEqual(skin);
    const c = paint(at(LEFT.chest), [1, 0, 0], skin);
    // Green wool, not skin: green the strongest channel.
    expect(c[1]).toBeGreaterThan(c[0]);
    // Dust settles on what faces up: the shoulder top is paler than the cloth's dye.
    const top = paint(at(LEFT.acromion), up, skin);
    expect(top[0]).toBeGreaterThan(g.cloth[0] * 1.5);
  });
});

describe('skin finish and eye shading', () => {
  it('the shared skin finish has no clear coat (one coat over a whole part reads as latex)', () => {
    const f = skinFinish('#8c7b72');
    expect(f.clearcoat).toBeUndefined();
    expect(f.sheen?.colour).toBe('#8c7b72');
  });

  it('the lid shadow darkens the top of the ball and not the bottom', () => {
    const spec = {
      centre: [0, 0, 0],
      r: 0.012,
      iris: 0.0058,
      upper: 0.25,
      lower: 0.12,
      lid: 0.002,
      colours: {
        sclera: [0.86, 0.84, 0.8],
        iris: [0.3, 0.4, 0.5],
        pupil: [0.03, 0.02, 0.02],
        wet: [0.8, 0.5, 0.5],
        caruncle: [0.8, 0.5, 0.5],
      },
    } as const;
    const lum = (m: ReturnType<typeof eyeball>, top: boolean): number => {
      let sum = 0;
      let n = 0;
      for (let v = 0; v < m.positions.length / 3; v++) {
        const z = m.positions[v * 3 + 2] ?? 0;
        if (top ? z > 0.007 : z < -0.007) {
          sum += m.colors[v * 3] ?? 0;
          n++;
        }
      }
      return sum / n;
    };
    const plain = eyeball(spec, 0.002);
    const shaded = eyeball(spec, 0.002, 0.55);
    expect(lum(shaded, true)).toBeLessThan(lum(plain, true) * 0.6);
    expect(lum(shaded, false)).toBeCloseTo(lum(plain, false), 6);
  });
});
