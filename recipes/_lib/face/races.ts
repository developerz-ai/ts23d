// Race presets: original stylisations of the one measured base, each declared as ratios against
// the human anchor (docs/research/face-base.md has the table). No copied designs — the vocabulary
// is the fantasy-race convention (orc: heavy jaw and brow shelf; elf: long narrow refined face;
// dwarf: broad nose, heavy brow, short wide face; goblin: hooked nose, big vault, small chin).

import { type FaceSpec, HUMAN } from './spec.ts';

/** Heavy-jawed brute: jaw ×1.35, brow shelf forward, broad flat nose, underbite, thick neck. */
export const ORC: FaceSpec = {
  ...HUMAN,
  scale: 1.12,
  cranium: { width: 1.05, height: 0.84, depth: 0.95 },
  brow: { forward: 0.07, height: -0.022 },
  eyes: { spacing: 1.06, tilt: -0.014, open: 0.78 },
  nose: { width: 1.8, projection: 0.72, length: 0.9, bridge: -0.02, hook: 0 },
  zygoma: { width: 1.16, height: -0.006, forward: 0.014 },
  jaw: { width: 1.4, drop: 0.07 },
  chin: { forward: 0.04, width: 1.35 },
  mouth: { width: 1.3, lips: 0.01, underbite: 0.04 },
  face: 1.06,
  ears: { length: 0.95, tip: [0.04, 0.03, 0.07], out: 12 },
  body: { neck: 1.5, traps: 0.14, shoulders: 1.12 },
};

/** Slender, long refined face: narrow jaw ×0.85, high zygoma, fine nose, long swept ears. */
export const ELF: FaceSpec = {
  ...HUMAN,
  scale: 1,
  cranium: { width: 0.95, height: 1.03, depth: 1.02 },
  brow: { forward: -0.004, height: 0.006 },
  eyes: { spacing: 1.04, tilt: 0.02, open: 0.95 },
  nose: { width: 0.85, projection: 1.08, length: 1.04, bridge: 0.006, hook: 0 },
  zygoma: { width: 1.04, height: 0.02, forward: 0.008 },
  jaw: { width: 0.85, drop: 0.02 },
  chin: { forward: 0.012, width: 0.8 },
  mouth: { width: 0.92, lips: 0, underbite: 0 },
  face: 1.08,
  ears: { length: 1.15, tip: [0.16, 0.05, 0.2], out: 6 },
  body: { neck: 0.9, traps: -0.02, shoulders: 0.95 },
};

/** Stout, broad: wide nose ×1.4, heavy brow, wide jaw ×1.25, short face ×0.88, big vault. */
export const DWARF: FaceSpec = {
  ...HUMAN,
  scale: 1.04,
  cranium: { width: 1.08, height: 0.94, depth: 1.03 },
  brow: { forward: 0.03, height: -0.01 },
  eyes: { spacing: 1.02, tilt: -0.006, open: 0.88 },
  nose: { width: 1.4, projection: 1.25, length: 1.0, bridge: 0.004, hook: 0.01 },
  zygoma: { width: 1.1, height: -0.006, forward: 0.008 },
  jaw: { width: 1.25, drop: -0.01 },
  chin: { forward: 0.01, width: 1.2 },
  mouth: { width: 1.05, lips: 0.002, underbite: 0 },
  face: 0.88,
  ears: { length: 1.05, tip: [0, 0, 0], out: 4 },
  body: { neck: 1.35, traps: 0.07, shoulders: 1.12 },
};

/** Small, big-skulled: long hooked nose, vault ×1.15, receding small chin, ears held out. */
export const GOBLIN: FaceSpec = {
  ...HUMAN,
  scale: 0.84,
  cranium: { width: 1.16, height: 1.12, depth: 1.1 },
  brow: { forward: 0.012, height: 0 },
  eyes: { spacing: 1.14, tilt: 0.008, open: 1.08 },
  nose: { width: 1.05, projection: 2.6, length: 1.3, bridge: 0.02, hook: 0.05 },
  zygoma: { width: 1.06, height: 0.01, forward: 0.012 },
  jaw: { width: 0.82, drop: -0.01 },
  chin: { forward: -0.03, width: 0.7 },
  mouth: { width: 1.35, lips: -0.002, underbite: 0 },
  face: 0.95,
  ears: { length: 1.7, tip: [0.12, 0.22, 0.1], out: 40 },
  body: { neck: 0.82, traps: -0.02, shoulders: 0.9 },
};

export const RACES = { human: HUMAN, orc: ORC, elf: ELF, dwarf: DWARF, goblin: GOBLIN } as const;
export type RaceName = keyof typeof RACES;
