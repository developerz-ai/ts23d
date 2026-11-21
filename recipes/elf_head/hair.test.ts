// The elf's comb: on the slope above the forehead it leads back over the top, never into the
// skin (D542). The cap under the locks is their own colour in shade (D543).

import { describe, expect, it } from 'bun:test';
import { dmath, type Vec3 } from '@developerz.ai/ts23d';
import { mix } from '../_lib/bust/hair.ts';
import { CAP, comb } from './hair.ts';
import { C, SK } from './spec.ts';

/** Share of the comb direction that lies in the skin at `p` with unit normal `n`. */
function inSkin(p: Vec3, n: Vec3): number {
  const c = comb(p, n);
  const along = c[0] * n[0] + c[1] * n[1] + c[2] * n[2];
  const len = dmath.hypot(c[0], c[1], c[2]);
  return Math.sqrt(Math.max(0, len * len - along * along)) / len;
}

describe('elf hair comb', () => {
  // D542: the comb pointed down as well as back there, straight into skin facing 38° up: its
  // tangent vanished, the locks rayed out of that pole like a flower and bared the cap as a
  // brown disc on the crown.
  it('has no pole on the midline between the hairline and the crown', () => {
    const x = SK.glabella[0] - 0.05 * (SK.glabella[0] - SK.occiput[0]);
    for (let deg = 30; deg <= 75; deg += 1) {
      const e = (deg * Math.PI) / 180;
      const n: Vec3 = [dmath.cos(e), 0, dmath.sin(e)];
      expect(inSkin([x, 0.004, SK.crown[2] - 0.02], n)).toBeGreaterThan(0.45);
    }
  });

  it('still falls at the sides and the back', () => {
    // Above the ear's sweep-back zone, on skin facing mostly sideways.
    const side = comb([SK.euryon[0], SK.euryon[1], SK.euryon[2] + 0.04], [0, 0.9, 0.43]);
    expect(side[2]).toBeLessThan(-0.8);
    const back = comb([SK.occiput[0], 0.01, SK.occiput[2]], [-1, 0, 0]);
    expect(back[2]).toBeLessThan(-1);
  });
});

describe('elf hair cap', () => {
  const lum = (c: Vec3): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

  // D543: at 0.18 of the locks' value (the root colour in shade) the cap showed between their
  // buried roots as a dark brown strip above the forehead.
  it('is the locks in shade: between a third and two thirds of their value', () => {
    const k = lum(CAP) / lum(mix(C.hairRoot, C.hairTip, 0.45));
    expect(k).toBeGreaterThan(0.33);
    expect(k).toBeLessThan(0.67);
  });
});
