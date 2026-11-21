import { describe, expect, it } from 'bun:test';
import { type Field, sculptField } from '@developerz.ai/ts23d';
import { builtHair, ELF_BUST } from '../../elf_head/build.ts';
import * as ELF from '../../elf_head/spec.ts';
import { GOBLIN_BUST } from '../../goblin_head/build.ts';
import * as GOBLIN from '../../goblin_head/spec.ts';
import { HUMAN_BUST } from '../../human_head/build.ts';
import { skullLandmarks, skullOf } from '../face/skull.ts';
import type { FaceSpec } from '../face/spec.ts';
import { type BustRecipe, bustEdits } from './bust.ts';
import { type EarGraft, graftFrame, graftLine } from './ear-graft.ts';
import {
  measureCheek,
  measureEar,
  measureLips,
  measureNeck,
  measureOrbit,
  thicknessAt,
} from './face-check.ts';
import { add, mul } from './kit.ts';
import { neckSeam } from './torso.ts';

const fields = new Map<string, Field>();

/** A bust's bare skin at LOD0 (no hair, no outfit); `soft` leaves out its feature edits: the
 *  warped base alone, as the busts were before D570–D576. Built once per bust, while the suites
 *  are collected (a field takes seconds: more than one test's time on a busy machine). */
function skinOf(b: BustRecipe, soft = false): Field {
  const key = `${b.spec.H}:${b.spec.skin.join(',')}:${soft}`;
  const hit = fields.get(key);
  if (hit) return hit;
  const f = buildSkin(b, soft);
  fields.set(key, f);
  return f;
}

function buildSkin(b: BustRecipe, soft: boolean): Field {
  const bare: BustRecipe = { ...b, hair: () => [], outfit: () => [] };
  if (soft) {
    const { features: _f, ...rest } = bare;
    return sculptField(bustEdits(rest, 4, 0).edits, { color: b.spec.skin, mirror: 'y' }).field;
  }
  return sculptField(bustEdits(bare, 4, 0).edits, { color: b.spec.skin, mirror: 'y' }).field;
}

/** The landmarks of a bust's own skull (the human's build narrows the shared hero's shoulders). */
const landmarks = (b: BustRecipe) => skullLandmarks(skullOf(b.skull ?? ELF.CHARACTER, b.spec));

const BUSTS = [
  { name: 'human', b: HUMAN_BUST, depth: 0.032, cheek: 0.0065 },
  { name: 'elf', b: ELF_BUST, depth: 0.024, cheek: 0.012 },
  { name: 'goblin', b: GOBLIN_BUST, depth: 0.05, cheek: 0.0085 },
] as const;

describe('face structure on the built skin (D570–D572)', () => {
  for (const { name, b, depth, cheek } of BUSTS) {
    const k = landmarks(b);
    const H = b.spec.H;
    const soft = skinOf(b, true);
    const built = skinOf(b);
    const base = measureOrbit(soft, b.eye.centre, b.eye.r, b.eye.iris);
    const o = measureOrbit(built, b.eye.centre, b.eye.r, b.eye.iris);
    const cheeks = [soft, built].map((f) => measureCheek(f, k.zygion, k.gonion, H));
    it(`${name}: the soft base fails every band (shallow orbit, no lid margin, flat cheek)`, () => {
      expect(base.depth / H).toBeLessThan(depth);
      expect(base.lid < 0.0015 || base.lid > 0.0045).toBe(true);
      expect(cheeks[0]).toBeLessThan(cheek);
    });
    it(`${name}: the brow overhangs the orbit, the lid has a margin, the cheekbone stands out`, () => {
      expect(o.depth / H).toBeGreaterThanOrEqual(depth);
      // The brow stays a brow: no more than 7 % H ahead of the cornea.
      expect(o.shelf / H).toBeLessThan(0.07);
      expect(o.lid).toBeGreaterThanOrEqual(0.0015);
      expect(o.lid).toBeLessThanOrEqual(0.0045);
      expect(cheeks[1]).toBeGreaterThanOrEqual(cheek);
    });
  }
});

describe('pointed ears (D573, D574)', () => {
  const k0 = GOBLIN.SK;
  const ears = [
    { name: 'elf', b: ELF_BUST, graft: ELF.GRAFT },
    { name: 'goblin', b: GOBLIN_BUST, graft: GOBLIN.GRAFT },
  ] as const;
  for (const { name, b, graft } of ears) {
    const k = landmarks(b);
    const measure = (f: Field, g: EarGraft) =>
      measureEar(f, graftLine(k, g), graftFrame(k, g).f.w, k.eye[2], k.euryon[1], b.spec.H);
    const film = measure(skinOf(b, true), graft);
    const e = measure(skinOf(b), graft);
    it(`${name}: the base's stretched ear alone is a film (no cartilage at the tip)`, () => {
      expect(film.thick[2]).toBeLessThan(0.002);
    });
    it(`${name}: the ear is cartilage at least 4 mm thick from mid-blade to the tip`, () => {
      expect(e.thick[1]).toBeGreaterThanOrEqual(0.004);
      expect(e.thick[2]).toBeGreaterThanOrEqual(0.004);
      expect(Math.max(...e.thick)).toBeLessThan(0.013);
    });
  }
  // The far LOD sculpts no features (stage 2): the graft is not there, the ear needs a blade
  // of its own (elf_head/build.ts `builtHair`).
  const far = (hair: BustRecipe['hair']): number => {
    const b: BustRecipe = { ...ELF_BUST, hair, outfit: () => [] };
    const f = sculptField(bustEdits(b, 2, 2).edits, { color: b.spec.skin, mirror: 'y' }).field;
    const { f: fr, length } = graftFrame(ELF.SK, ELF.GRAFT);
    const at = (t: number): number => thicknessAt(f, add(fr.o, mul(fr.u, length * t)), fr.w);
    return Math.min(at(0.5), at(0.8));
  };
  const cell = ELF_BUST.cells.head[2];
  const bare = far(ELF_BUST.hair);
  const bladed = far(builtHair);
  it('elf: at LOD2 the bust alone has no ear its 2.2 cm cell can hold', () => {
    expect(bare).toBeLessThan(cell * 0.9);
  });
  it('elf: at LOD2 the built skin carries an ear blade no thinner than its cell to the tip', () => {
    expect(bladed).toBeGreaterThanOrEqual(cell * 0.9);
  });
  it('elf: the old tip stood beside the crown (+0.37 H over the eye line), inside the hair', () => {
    const race: FaceSpec = {
      ...ELF.CHARACTER.race,
      ears: { length: 1.7, tip: [0.2, 0.065, 0.26], out: 13 },
    };
    const k = skullLandmarks(skullOf({ ...ELF.CHARACTER, race }, ELF.SPEC));
    expect((k.earTip[2] - k.eye[2]) / ELF.H).toBeGreaterThan(0.25);
  });
  it('elf: the tip ends between the brow and the crown, clear of the skull’s side', () => {
    const k = ELF.SK;
    const up = (k.earTip[2] - k.eye[2]) / ELF.H;
    expect(up).toBeGreaterThan((k.brow[2] - k.eye[2]) / ELF.H);
    expect(up).toBeLessThan(0.25);
    expect((Math.abs(k.earTip[1]) - k.euryon[1]) / ELF.H).toBeGreaterThanOrEqual(0.13);
  });
  it('goblin: the old tip stood straight out of the ear’s top (edge-on from the side)', () => {
    const race: FaceSpec = {
      ...GOBLIN.CHARACTER.race,
      ears: { length: 2.6, tip: [0.04, 0.5, 0.1], out: 60 },
    };
    const k = skullLandmarks(skullOf({ ...GOBLIN.CHARACTER, race }, GOBLIN.SPEC));
    expect((k.earTop[0] - k.earTip[0]) / GOBLIN.H).toBeLessThan(0.1);
  });
  it('goblin: the tip sweeps back at least a tenth of the head behind the ear’s top', () => {
    const k = GOBLIN.SK;
    expect((k.earTop[0] - k.earTip[0]) / GOBLIN.H).toBeGreaterThanOrEqual(0.1);
  });
  it('goblin: the head/bust split bent up over the shoulders gave the ear tips to `bust` (D577)', () => {
    const seam = neckSeam(GOBLIN.LT).field;
    const tip: [number, number, number] = [k0.earTip[0], Math.abs(k0.earTip[1]), k0.earTip[2]];
    // The old split: the seam less twice the distance out past 5.5 cm, at any height.
    expect(seam(tip) - 2 * Math.max(0, tip[1] - 0.055)).toBeLessThan(0);
    expect(GOBLIN_BUST.split?.(tip)).toBeGreaterThan(0);
    // The shoulders' cloth still goes to `bust`.
    expect(GOBLIN_BUST.split?.([0, 0.1, GOBLIN.LT.mz - 0.02])).toBeLessThan(0);
  });
  it('gauges nothing where there is no skin', () => {
    expect(thicknessAt(() => 1, [0, 0, 0], [0, 1, 0])).toBe(0);
  });
});

describe('neck and mouth (D575, D576)', () => {
  const column = measureNeck(skinOf(HUMAN_BUST, true), landmarks(HUMAN_BUST));
  const n = measureNeck(skinOf(HUMAN_BUST), landmarks(HUMAN_BUST));
  it('human: the base neck is a column (front length over 0.74 of its breadth)', () => {
    expect(column.ratio).toBeGreaterThan(0.74);
  });
  it('human: the neck is a man’s, 115–125 mm across under an 85 mm front', () => {
    expect(n.ratio).toBeLessThanOrEqual(0.74);
    expect(n.breadth).toBeGreaterThanOrEqual(0.115);
    expect(n.breadth).toBeLessThanOrEqual(0.125);
  });
  const k = GOBLIN.SK;
  const lips = (f: Field): number =>
    measureLips(f, k.stomion, Math.abs(k.cheilion[1]) * 0.4, 0.016 * GOBLIN.H);
  const slot = lips(skinOf(GOBLIN_BUST, true));
  const rolled = lips(skinOf(GOBLIN_BUST));
  it('goblin: the base mouth is a slot (lips under 3 mm over the slit)', () => {
    expect(slot).toBeLessThan(0.003);
  });
  it('goblin: the lips roll at least 3 mm out over the mouth’s gap', () => {
    expect(rolled).toBeGreaterThanOrEqual(0.003);
  });
});
