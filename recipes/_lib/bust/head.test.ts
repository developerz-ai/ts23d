import { describe, expect, it } from 'bun:test';
import { ELF_BUST } from '../../elf_head/build.ts';
import { GOBLIN_BUST } from '../../goblin_head/build.ts';
import { HUMAN_BUST } from '../../human_head/build.ts';
import { checkRatios, HUMAN, landmarks } from './head.ts';
import { checkNeck, NECK_HUMAN, neckRatios } from './torso.ts';

const spec = (r = HUMAN) => ({
  H: 0.23,
  glabella: [0.1, 0, 0.5] as [number, number, number],
  r,
  eyeR: 0.052,
  skin: [0.6, 0.4, 0.3] as [number, number, number],
  lips: [0.5, 0.3, 0.3] as [number, number, number],
});

describe('bust head ratios', () => {
  it('rejects features out of order (an eye line below the nose tip)', () => {
    expect(() => checkRatios({ ...HUMAN, eye: 0.3 })).toThrow(/eye 0.3 is not above noseTip/);
  });
  it('rejects a stylisation beyond 3× the human anchor', () => {
    expect(() => checkRatios({ ...HUMAN, ipd: HUMAN.ipd * 4 })).toThrow(/beyond 3× the human/);
  });
  it('places the human landmarks at the measured ratios of H', () => {
    const l = landmarks(spec());
    expect((l.eye[2] - l.mz) / 0.23).toBeCloseTo(HUMAN.eye, 6);
    expect((l.eye[1] * 2) / 0.23).toBeCloseTo(HUMAN.ipd, 6);
    expect((l.crown - l.mz) / 0.23).toBeCloseTo(1, 6);
    expect((l.gx - l.back) / 0.23).toBeCloseTo(HUMAN.depth, 6);
  });
});

describe('bust neck ratios', () => {
  it('rejects a goblin head balanced on a pole (the old 3 cm neck, 0.39 × head width)', () => {
    const stick = { ...GOBLIN_BUST.torso, neck: 0.03 };
    expect(neckRatios(GOBLIN_BUST.l, stick).width).toBeLessThan(0.45);
    expect(() => checkNeck(GOBLIN_BUST.l, stick, GOBLIN_BUST.neck)).toThrow(/neck width 0\.39/);
  });
  it('rejects a thin human neck against the measured human range', () => {
    const thin = { ...HUMAN_BUST.torso, neck: 0.05 };
    expect(() => checkNeck(HUMAN_BUST.l, thin)).toThrow(/outside the declared 0\.7…0\.8/);
  });
  it('holds every bust to its declared neck: human measured, elf slender, goblin skinny', () => {
    const human = checkNeck(HUMAN_BUST.l, HUMAN_BUST.torso, HUMAN_BUST.neck);
    expect(human.width).toBeGreaterThanOrEqual(NECK_HUMAN.width[0]);
    expect(human.length).toBeLessThanOrEqual(0.35);
    expect(checkNeck(ELF_BUST.l, ELF_BUST.torso, ELF_BUST.neck).width).toBeGreaterThan(0.6);
    const goblin = checkNeck(GOBLIN_BUST.l, GOBLIN_BUST.torso, GOBLIN_BUST.neck);
    expect(goblin.width).toBeGreaterThanOrEqual(0.45);
    expect(goblin.length).toBeLessThanOrEqual(0.35);
  });
});
