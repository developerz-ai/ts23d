// The elf's long hair at the far LODs (D585, D586, D588), measured on the compiled LOD1 and LOD2:
// the locks lie on the hair shell and hang down the back instead of fanning out as wide slabs
// (LOD0's: p90 16 mm, p99 47 mm off what is under them; the fall hangs free by design), they
// cover the scalp, no far lock grows over an ear, and the hair renders the same colour at LOD1
// and LOD2.

import { describe, expect, it } from 'bun:test';
import { compile, type Vec3 } from '@developerz.ai/ts23d';
import { cardStandoff, hairLook, quantile } from '../_lib/bust/hair.ts';
import { type CardHairStyle, earClear, hairValue } from '../_lib/face/hair-cards.ts';
import { elf_head } from './elf_head.ts';
import { farHair, hairline } from './hair.ts';
import { SK } from './spec.ts';

const near = compile(elf_head, { lod: 1 });
const far = compile(elf_head, { lod: 2 });
const mm = (m: number): number => Math.round(m * 10000) / 10;
const lum = (c: Vec3): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const skull: Vec3 = [(SK.glabella[0] + SK.occiput[0]) / 2, 0, SK.euryon[2]];

describe('elf hair at LOD2 (D585)', () => {
  // Before: p90 86 mm, p99 131 mm — a fan of 11 cm wide slabs standing off the skull.
  it('lies on the shell and hangs down the back', () => {
    const d = cardStandoff(far);
    expect(mm(quantile(d, 0.9))).toBeLessThan(55);
    expect(mm(quantile(d, 0.99))).toBeLessThan(90);
  });

  it('covers the scalp with locks', () => {
    const look = hairLook(far, { centre: skull, line: hairline });
    expect(look.rays).toBeGreaterThan(150);
    expect(look.cards).toBeGreaterThan(0.7);
  });
});

describe('elf hair at LOD1 (D586)', () => {
  // Before: p99 76 mm, the farthest 133 mm — the fall left the occiput straight back.
  it('lies on the head and hangs', () => {
    const d = cardStandoff(near);
    expect(mm(quantile(d, 0.99))).toBeLessThan(60);
    expect(mm(quantile(d, 1))).toBeLessThan(100);
  });
});

describe('elf far hair and the ears (D588)', () => {
  // A style of one lock layer growing everywhere: farHair alone decides where it may root.
  const style: CardHairStyle = {
    field: () => 1,
    bounds: [
      [-1, -1, -1],
      [1, 1, 1],
    ],
    cell: 0.004,
    comb: () => [-1, 0, 0],
    color: [0.5, 0.4, 0.2],
    layers: [
      { name: 'hair_long', kind: 'hair', region: () => -1, density: 1, length: 0.1, width: 0.02 },
    ],
  };
  // Before: the far locks kept the near hairline's 1.6 cm round the ear, and hugging the head
  // they lay down over the blade. The ring 1.7–2.9 cm round each ear holds scalp the hairline
  // lets hair grow on: no far lock may root there.
  it('roots no lock within 3 cm of either ear', () => {
    const region = farHair(style).layers[0]?.region;
    expect(region).toBeDefined();
    const inner = earClear(SK, 0.017);
    const outer = earClear(SK, 0.029);
    let scalp = 0;
    for (let x = -0.08; x <= 0.06; x += 0.004)
      for (let y = -0.13; y <= 0.13; y += 0.004)
        for (let z = 0.36; z <= 0.52; z += 0.004) {
          const p: Vec3 = [x, y, z];
          if (inner(p) > 0 || outer(p) < 0) continue;
          if (hairline(p) < 0) scalp++;
          expect(region?.(p) ?? -1).toBeGreaterThan(0);
        }
    expect(scalp).toBeGreaterThan(100);
  });
});

describe('elf hair colour across LODs (D586)', () => {
  // Seen from the top, the back and the side (the mean of the three: one spot is one lock).
  it('renders the hair the same colour at LOD1 and LOD2', () => {
    const value = (a: typeof near): number =>
      VIEWS.reduce((s, dir) => s + lum(hairValue(a, skull, dir)), 0) / VIEWS.length;
    expect(Math.abs(value(far) / value(near) - 1)).toBeLessThan(0.1);
  }, 60_000);
});

const VIEWS: readonly Vec3[] = [
  [-0.3, 0.2, 1],
  [-1, 0.3, 0.5],
  [-0.2, 1, 0.4],
];
