// The five demo characters: one measured base, five race presets (recipes/_lib/face/races.ts),
// each with its own age, weight, seeded asymmetry, skin palette, eyes and hair. Original designs.

import type { FaceBust } from '../_lib/face/bust.ts';
import { DWARF, ELF, GOBLIN, ORC } from '../_lib/face/races.ts';
import { HUMAN } from '../_lib/face/spec.ts';

const STONE: [number, number, number] = [0.36, 0.34, 0.32];

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
    },
    hair: { cut: 'short', root: [0.16, 0.1, 0.06], tip: [0.32, 0.21, 0.12] },
    plinth: STONE,
  },
  orc: {
    character: {
      race: ORC,
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
      tusks: 0.13,
      mouth: 0,
    },
    hair: { cut: 'crest', root: [0.06, 0.05, 0.04], tip: [0.14, 0.12, 0.1] },
    plinth: STONE,
  },
  elf: {
    character: {
      race: ELF,
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
    },
    hair: { cut: 'short', beard: 'full', root: [0.36, 0.16, 0.06], tip: [0.62, 0.34, 0.14] },
    plinth: STONE,
  },
  goblin: {
    character: {
      race: GOBLIN,
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
    },
    hair: { cut: 'none', root: [0.1, 0.1, 0.08], tip: [0.2, 0.2, 0.16] },
    plinth: STONE,
  },
};
