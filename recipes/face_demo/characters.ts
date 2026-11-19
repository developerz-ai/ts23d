// The five demo characters: one measured base, five race presets (recipes/_lib/face/races.ts),
// each with its own age, weight, seeded asymmetry, skin palette, eyes, hair and the marks life left
// (sun, freckles, stubble, scars, grime). The presets are pushed a little further here than the
// shared table: longer elf ears and a stronger almond tilt, bigger goblin eyes and a hookier nose,
// a higher orc trapezius with a flatter, wider nose. Original designs.

import type { FaceBust } from '../_lib/face/bust.ts';
import { LEFT, MIDLINE, mirrorY } from '../_lib/face/landmarks.ts';
import { DWARF, ELF, GOBLIN, ORC } from '../_lib/face/races.ts';
import { HUMAN } from '../_lib/face/spec.ts';

const STONE: [number, number, number] = [0.36, 0.34, 0.32];

type P = readonly [number, number, number];
/** A base point `d` away from a landmark (metres on the base head). */
const off = (p: P, d: P): [number, number, number] => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];

export const CHARACTERS: Record<'human' | 'orc' | 'elf' | 'dwarf' | 'goblin', FaceBust> = {
  human: {
    character: {
      race: HUMAN,
      age: 0.25,
      weight: 0,
      asym: 0.3,
      tone: {
        base: [0.78, 0.58, 0.47],
        flush: [0.8, 0.46, 0.4],
        lips: [0.72, 0.44, 0.4],
        cool: [0.6, 0.5, 0.52],
        cavity: [0.38, 0.24, 0.2],
      },
      eyes: { iris: [0.3, 0.42, 0.55] },
      mouth: 0,
      // A man who works outdoors: sun and freckles, a day's stubble, a nick through one brow.
      wear: {
        sun: 0.55,
        freckles: 0.5,
        grime: 0.25,
        stubble: { colour: [0.4, 0.33, 0.32], amount: 0.42 },
        scars: [[off(LEFT.brow, [0.003, 0.012, 0.014]), off(LEFT.brow, [0.004, 0.017, -0.004])]],
      },
    },
    hair: { cut: 'short', root: [0.16, 0.1, 0.06], tip: [0.32, 0.21, 0.12] },
    plinth: STONE,
  },
  orc: {
    character: {
      race: {
        ...ORC,
        nose: { ...ORC.nose, width: 1.95, bridge: -0.03 },
        body: { ...ORC.body, traps: 0.2 },
      },
      age: 0.4,
      weight: 0.3,
      asym: 0.8,
      tone: {
        base: [0.36, 0.48, 0.26],
        flush: [0.42, 0.44, 0.24],
        lips: [0.3, 0.3, 0.2],
        cool: [0.28, 0.36, 0.28],
        cavity: [0.14, 0.18, 0.1],
      },
      eyes: { iris: [0.62, 0.4, 0.08], sclera: [0.82, 0.78, 0.6] },
      tusks: 0.16,
      mouth: 0,
      // A fighter: an old cut from the forehead through the brow to the cheek, another along
      // the jaw, a split in the lower lip; camp dirt in every hollow.
      wear: {
        sun: 0.45,
        freckles: 0.35,
        grime: 0.75,
        scars: [
          [
            mirrorY(off(LEFT.frontotemporale, [0.012, -0.03, 0.004])),
            mirrorY(off(LEFT.brow, [0.004, 0.006, 0.006])),
            mirrorY(LEFT.orbitale),
            mirrorY(off(LEFT.cheek, [0.004, 0.004, -0.012])),
          ],
          [off(LEFT.jawline, [0.004, 0, 0.012]), off(LEFT.gonion, [0.02, 0.002, 0.014])],
          [off(MIDLINE.labraleInf, [0, 0.008, 0.003]), off(MIDLINE.pogonion, [0, 0.012, 0.012])],
        ],
      },
    },
    hair: { cut: 'crest', root: [0.06, 0.05, 0.04], tip: [0.14, 0.12, 0.1] },
    plinth: STONE,
  },
  elf: {
    character: {
      race: {
        ...ELF,
        eyes: { ...ELF.eyes, tilt: 0.032 },
        ears: { ...ELF.ears, length: 1.25, tip: [0.19, 0.055, 0.24] },
      },
      age: 0.05,
      weight: -0.4,
      asym: 0.3,
      tone: {
        base: [0.86, 0.72, 0.62],
        flush: [0.86, 0.6, 0.56],
        lips: [0.74, 0.48, 0.48],
        cool: [0.7, 0.66, 0.7],
        cavity: [0.46, 0.34, 0.32],
      },
      eyes: { iris: [0.22, 0.52, 0.42] },
      mouth: 0,
      // Ageless but not porcelain: a dusting of freckles and a little sun.
      wear: { sun: 0.3, freckles: 0.65, grime: 0.08 },
    },
    hair: { cut: 'long', root: [0.6, 0.48, 0.26], tip: [0.86, 0.76, 0.5] },
    plinth: STONE,
  },
  dwarf: {
    character: {
      race: DWARF,
      age: 0.6,
      weight: 0.5,
      asym: 0.6,
      tone: {
        base: [0.76, 0.54, 0.42],
        flush: [0.82, 0.42, 0.34],
        lips: [0.62, 0.32, 0.3],
        cool: [0.58, 0.48, 0.46],
        cavity: [0.34, 0.2, 0.15],
      },
      eyes: { iris: [0.36, 0.26, 0.14] },
      mouth: 0,
      // A smith: forge-reddened, weathered skin, an old burn line over the nose and a cut on
      // the forehead, soot in the creases.
      wear: {
        sun: 0.75,
        freckles: 0.55,
        grime: 0.55,
        scars: [
          [off(MIDLINE.rhinion, [0, -0.012, 0.004]), off(MIDLINE.rhinion, [0.001, 0.012, -0.003])],
          [off(MIDLINE.forehead, [0, 0.02, -0.03]), off(MIDLINE.forehead, [0, 0.036, -0.012])],
        ],
      },
    },
    hair: { cut: 'short', beard: 'full', root: [0.36, 0.16, 0.06], tip: [0.62, 0.34, 0.14] },
    plinth: STONE,
  },
  goblin: {
    character: {
      race: {
        ...GOBLIN,
        eyes: { ...GOBLIN.eyes, size: 1.3 },
        nose: { ...GOBLIN.nose, hook: GOBLIN.nose.hook + 0.012 },
      },
      age: 0.3,
      weight: -0.3,
      asym: 1,
      tone: {
        base: [0.52, 0.56, 0.26],
        flush: [0.62, 0.5, 0.26],
        lips: [0.42, 0.34, 0.2],
        cool: [0.4, 0.44, 0.3],
        cavity: [0.2, 0.22, 0.08],
      },
      eyes: { iris: [0.85, 0.62, 0.1], pupil: 'slit', sclera: [0.84, 0.8, 0.56] },
      mouth: 0.4,
      // A scavenger: blotched, warty skin, grime everywhere, old claw marks over the bald vault.
      wear: {
        sun: 0.3,
        freckles: 0.9,
        grime: 0.85,
        scars: [
          [off(MIDLINE.forehead, [-0.02, 0.012, 0.03]), off(MIDLINE.crown, [0.02, 0.02, -0.004])],
          [
            off(MIDLINE.forehead, [-0.024, 0.026, 0.024]),
            off(MIDLINE.crown, [0.012, 0.036, -0.01]),
          ],
          [
            mirrorY(off(LEFT.cheek, [0.002, 0, 0.006])),
            mirrorY(off(LEFT.zygion, [0.012, -0.004, -0.004])),
          ],
        ],
      },
    },
    hair: { cut: 'none', root: [0.1, 0.1, 0.08], tip: [0.2, 0.2, 0.16] },
    plinth: STONE,
  },
};
