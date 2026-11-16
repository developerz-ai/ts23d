import { describe, expect, it } from 'bun:test';
import type { Vec3 } from '@developerz.ai/ts23d';
import { H, SK } from '../bust/human/spec.ts';
import { browLayers, browLine, browPath, lashLine, withBrowComb } from './brows.ts';

const up: Vec3 = [0, 0, 1];
const back = (): Vec3 => [-1, 0, 0];

describe('brow and lash cards', () => {
  const line = browLine(SK, H);
  const path = browPath(SK, H);
  it('grows on the brow (both sides), not on the forehead above it or the eye below', () => {
    const mid = path[6] as Vec3;
    expect(line(mid)).toBeLessThan(0);
    expect(line([mid[0], -mid[1], mid[2]])).toBeLessThan(0);
    // Proud of the landmark line (the sculpted ridge) still counts; 2 cm up or down does not.
    expect(line([mid[0] + 0.006, mid[1], mid[2]])).toBeLessThan(0);
    expect(line([mid[0], mid[1], mid[2] + 0.02])).toBeGreaterThan(0);
    expect(line(SK.eye)).toBeGreaterThan(0);
  });
  it('tapers toward the tail', () => {
    const head = path[0] as Vec3;
    const tail = path[12] as Vec3;
    expect(line([head[0], head[1], head[2] + 0.004])).toBeLessThan(0);
    expect(line([tail[0], tail[1], tail[2] + 0.004])).toBeGreaterThan(0);
  });
  it('combs brow hairs out along the brow toward the temple; elsewhere the recipe comb', () => {
    const comb = withBrowComb(back, SK, H);
    const tail = path[10] as Vec3;
    expect(comb(tail, up)[1]).toBeGreaterThan(0.5);
    expect(comb([tail[0], -tail[1], tail[2]], up)[1]).toBeLessThan(-0.5);
    expect(comb(SK.crown, up)).toEqual([-1, 0, 0]);
  });
  it('roots lashes on a ring just in front of and above the eyeball, never behind it', () => {
    const eye = { centre: SK.eye, r: SK.eyeR };
    const lash = lashLine(eye);
    const r = SK.eyeR * 1.12;
    expect(lash([SK.eye[0] + r * 0.8, SK.eye[1], SK.eye[2] + r * 0.55])).toBeLessThan(0);
    expect(lash([SK.eye[0] - r, SK.eye[1], SK.eye[2]])).toBeGreaterThan(0);
    expect(lash([SK.eye[0] + r * 0.8, SK.eye[1], SK.eye[2] - r * 0.55])).toBeGreaterThan(0);
    expect(browLayers(SK, H, { eye }).map((l) => l.name)).toEqual(['brows', 'lashes']);
    expect(browLayers(SK, H).map((l) => l.name)).toEqual(['brows']);
  });
});
