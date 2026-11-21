import { describe, expect, it } from 'bun:test';
import { createRng, type Vec3 } from '@developerz.ai/ts23d';
import { faceHead } from './head.ts';
import { LEFT, MIDLINE } from './landmarks.ts';
import { clearZone, complexionZones, freckleZone } from './skin-zones.ts';
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
const at = (q: Vec3): Vec3 => head.map(q);
const marks = {
  nasion: at(MIDLINE.nasion),
  pronasale: at(MIDLINE.pronasale),
  cheek: at(LEFT.cheek),
  zygion: at(LEFT.zygion),
  eye: at(LEFT.eye),
  tragion: at(LEFT.tragion),
};
const mid = (a: Vec3, b: Vec3, t = 0.5): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
// Points on the face's surface (landmarks and blends of them).
const bridge = mid(marks.nasion, marks.pronasale, 0.45);
const cheekbone = mid(marks.cheek, marks.zygion, 0.3);
const foreheadSide = at(LEFT.frontotemporale);
const forehead = at(MIDLINE.forehead);
const jaw = at(LEFT.jawline);
const chin = at(MIDLINE.pogonion);

describe('skin zones (D520: freckles and pores where a face has them)', () => {
  it('fails if freckles spread evenly: dense over the bridge and cheekbones, none on brow or jaw', () => {
    const f = freckleZone({ bridge, cheek: cheekbone, back: marks.zygion[0] - 0.005 }, 0.03, 1);
    expect(f(bridge)).toBeGreaterThan(0.9);
    expect(f(mid(bridge, cheekbone))).toBeGreaterThan(0.9);
    expect(f(cheekbone)).toBeGreaterThan(0.9);
    for (const p of [forehead, foreheadSide, jaw, chin]) expect(f(p)).toBe(0);
    // Mirrored: the right cheekbone too.
    expect(f([cheekbone[0], -cheekbone[1], cheekbone[2]])).toBeGreaterThan(0.9);
  });

  it('fails if pores are even: the cheek keeps them, forehead sides, jaw and neck are clear', () => {
    const c = clearZone({ cheek: marks.cheek, back: marks.tragion[0] }, 0.026, 0.022);
    expect(c(marks.cheek)).toBe(0);
    for (const p of [foreheadSide, jaw, at(LEFT.neck)]) expect(c(p)).toBe(1);
  });

  it('fine skin keeps coarse pores on less of the cheek and narrows the freckles', () => {
    const plain = complexionZones(marks, 1, { freckles: 1 });
    const fine = complexionZones(marks, 1, { freckles: 1, fine: true });
    const edge = mid(marks.cheek, marks.zygion, 0.6);
    expect(fine.clear(edge)).toBeGreaterThan(plain.clear(edge));
    const off: Vec3 = [cheekbone[0], cheekbone[1], cheekbone[2] - 0.01];
    expect(fine.freckle?.(off) ?? 0).toBeLessThan(plain.freckle?.(off) ?? 0);
    expect(complexionZones(marks, 1).freckle).toBeUndefined();
  });
});
