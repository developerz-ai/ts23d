// The human's hair at the far LODs (D585–D587), measured on the compiled LOD1 and LOD2: the
// cards lie on the hair shell instead of standing off the skull as shards (LOD0's locks: p90
// 7 mm, p99 15 mm off what is under them), they still cover the scalp, the beard keeps its value
// (its paint alone faded toward skin over LOD2's 2.6 cm triangles) and the hair renders the same
// colour at LOD1 and LOD2.

import { describe, expect, it } from 'bun:test';
import { compile, type Vec3 } from '@developerz.ai/ts23d';
import { cardStandoff, hairLook, quantile } from '../_lib/bust/hair.ts';
import { SK } from '../_lib/bust/human/spec.ts';
import { hairValue } from '../_lib/face/hair-cards.ts';
import { beardline, hairline } from './hair.ts';
import { human_head } from './human_head.ts';

const near = compile(human_head, { lod: 1 });
const far = compile(human_head, { lod: 2 });
const mm = (m: number): number => Math.round(m * 10000) / 10;
const lum = (c: Vec3): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const skull: Vec3 = [(SK.glabella[0] + SK.occiput[0]) / 2, 0, SK.euryon[2]];

describe('human hair at LOD2 (D585)', () => {
  // Before: p90 27.5 mm, the farthest 64 mm — a fan of wide shards off a bald-looking skull.
  it('lies on the hair shell', () => {
    const d = cardStandoff(far);
    expect(mm(quantile(d, 0.9))).toBeLessThan(20);
    expect(mm(quantile(d, 1))).toBeLessThan(30);
  });

  it('covers the scalp with hair (cards or the shell in the hair colour)', () => {
    const look = hairLook(far, { centre: skull, line: hairline });
    expect(look.rays).toBeGreaterThan(150);
    expect(lum(look.color)).toBeLessThan(0.08);
  });
});

describe('human hair at LOD1 (D586)', () => {
  // Before: p99 35 mm, the farthest 61 mm — a few spiky two-segment cards.
  it('lies on the head', () => {
    const d = cardStandoff(near);
    expect(mm(quantile(d, 0.99))).toBeLessThan(25);
    expect(mm(quantile(d, 1))).toBeLessThan(40);
  });

  it('covers the scalp with cards', () => {
    expect(hairLook(near, { centre: skull, line: hairline }).cards).toBeGreaterThan(0.8);
  });
});

describe('human hair colour across LODs (D587)', () => {
  const chin: Vec3 = [SK.glabella[0] - 0.05, 0, SK.glabella[2] - 0.08];
  // Before: the LOD2 beard met 1.43 × LOD1's value (cards gone, the paint fading to skin).
  it('keeps the beard value at LOD2', () => {
    const at = (a: typeof near): number =>
      lum(hairLook(a, { centre: chin, line: beardline, rays: 1200 }).color);
    const k = at(far) / at(near);
    expect(k).toBeGreaterThan(0.8);
    expect(k).toBeLessThan(1.25);
  });

  // Seen from the top, the back and the side (the mean of the three: one spot is one card).
  it('renders the hair the same colour at LOD1 and LOD2', () => {
    const value = (a: typeof near): number =>
      VIEWS.reduce((s, dir) => s + lum(hairValue(a, skull, dir)), 0) / VIEWS.length;
    expect(Math.abs(value(far) / value(near) - 1)).toBeLessThan(0.1);
  });
});

const VIEWS: readonly Vec3[] = [
  [-0.3, 0.2, 1],
  [-1, 0.3, 0.5],
  [-0.2, 1, 0.4],
];
