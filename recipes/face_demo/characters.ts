// The five demo characters: one measured base, five race presets (recipes/_lib/face/races.ts),
// each with its own age, weight, seeded asymmetry, skin palette, eyes, hair and the marks life left
// (sun, freckles, stubble, scars, grime). Tones are linear albedo in skin's measured range (a
// fair cheek ≈ 0.6 / 0.4 / 0.3; above 0.8 the hero's sky washes a face to porcelain). The presets are pushed a little further here than the
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
        base: [0.66, 0.45, 0.33],
        flush: [0.74, 0.38, 0.31],
        lips: [0.6, 0.3, 0.27],
        cool: [0.52, 0.42, 0.42],
        cavity: [0.3, 0.17, 0.13],
      },
      eyes: { iris: [0.3, 0.42, 0.55] },
      mouth: 0,
      // Sun freckles over the bridge and cheekbones, fading out toward brow and jaw (D520).
      complexion: { freckles: 0.5 },
      // A man who works outdoors: sun and freckles, a day's stubble, a nick through one brow.
      wear: {
        sun: 0.55,
        freckles: 0.5,
        grime: 0.25,
        wind: 0.35,
        stubble: { colour: [0.15, 0.11, 0.08], amount: 0.8 },
        scars: [
          [off(LEFT.brow, [0.003, 0.012, 0.014]), off(LEFT.brow, [0.004, 0.017, -0.004])],
          // A split healed white on the chin, off the midline.
          [
            mirrorY(off(MIDLINE.pogonion, [0.002, 0.004, 0.008])),
            mirrorY(off(MIDLINE.pogonion, [0, 0.014, -0.004])),
          ],
        ],
      },
    },
    hair: { cut: 'short', root: [0.16, 0.1, 0.06], tip: [0.32, 0.21, 0.12] },
    plinth: STONE,
    // Undyed wool with a leather-bound collar: a working man's tunic.
    garment: { cloth: [0.3, 0.24, 0.17], trim: [0.16, 0.1, 0.06], dust: 0.5 },
  },
  orc: {
    character: {
      race: {
        ...ORC,
        // The brute's mask: a shelf of brow low over small eyes, a flat broad nose, a jaw
        // wider than the cheekbones.
        brow: { forward: 0.1, height: -0.032 },
        eyes: { ...ORC.eyes, open: 0.7 },
        nose: { ...ORC.nose, width: 2.25, bridge: -0.05, projection: 0.58 },
        jaw: { width: 1.52, drop: 0.08 },
        body: { ...ORC.body, traps: 0.2 },
      },
      age: 0.4,
      weight: 0.3,
      asym: 0.8,
      tone: {
        base: [0.27, 0.37, 0.17],
        flush: [0.38, 0.34, 0.16],
        lips: [0.235, 0.35, 0.15],
        cool: [0.2, 0.28, 0.22],
        cavity: [0.09, 0.12, 0.06],
      },
      eyes: { iris: [0.62, 0.4, 0.08], sclera: [0.82, 0.78, 0.6] },
      tusks: 0.16,
      teeth: 'crooked',
      mouth: 0,
      // A fighter: an old cut from the forehead through the brow to the cheek, another along
      // the jaw, a slash from the lower lip across the chin; camp dirt in every hollow.
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
          // (Across the chin at 45°, not straight down it: straight below the teeth the pale
          // line read as a drip in the front view.)
          [
            off(MIDLINE.labraleInf, [0, 0.017, -0.002]),
            off(MIDLINE.pogonion, [0.004, -0.003, 0.01]),
          ],
        ],
      },
    },
    hair: { cut: 'crest', root: [0.06, 0.05, 0.04], tip: [0.14, 0.12, 0.1] },
    plinth: STONE,
    // Rust-dyed hide-cloth under an iron-grey collar band, camp-dusty.
    garment: { cloth: [0.28, 0.12, 0.07], trim: [0.17, 0.17, 0.18], dust: 0.6, vee: 0.02 },
  },
  elf: {
    character: {
      race: {
        ...ELF,
        eyes: { ...ELF.eyes, tilt: 0.032 },
        ears: { ...ELF.ears, length: 1.25, tip: [0.21, 0.06, 0.28] },
      },
      age: 0.05,
      weight: -0.4,
      asym: 0.3,
      tone: {
        base: [0.76, 0.58, 0.47],
        flush: [0.8, 0.47, 0.43],
        lips: [0.66, 0.34, 0.35],
        cool: [0.6, 0.52, 0.57],
        cavity: [0.38, 0.25, 0.23],
      },
      eyes: { iris: [0.22, 0.52, 0.42] },
      mouth: 0,
      // Fine skin: a butterfly of freckles over the bridge and cheekbones, coarse pores only on
      // the nose and the cheeks' centres, near-invisible elsewhere (D520).
      complexion: { freckles: 0.9, fine: true },
      // Ageless but not porcelain: freckles, a little sun and wind, and a ranger's thin old cut
      // along the cheekbone.
      wear: {
        sun: 0.3,
        freckles: 0.45,
        grime: 0.08,
        wind: 0.2,
        scars: [
          [off(LEFT.zygion, [0.03, -0.004, -0.004]), off(LEFT.cheek, [-0.012, 0.006, 0.008])],
        ],
      },
    },
    // Golden: a honey root to a saturated pale-gold tip ([0.52, 0.36, 0.15] → [0.84, 0.66,
    // 0.34] was a greyed khaki range that read as straw, D525).
    hair: { cut: 'long', root: [0.42, 0.23, 0.06], tip: [0.92, 0.68, 0.28] },
    plinth: STONE,
    // Forest-green wool, a gold braid at the collar, a deeper V; barely travel-dusted.
    garment: { cloth: [0.06, 0.2, 0.12], trim: [0.62, 0.46, 0.16], dust: 0.35, vee: 0.035 },
  },
  dwarf: {
    character: {
      // An old smith: a heavier brow and a broader nose than the preset's.
      race: {
        ...DWARF,
        brow: { forward: 0.05, height: -0.016 },
        nose: { ...DWARF.nose, width: 1.6 },
      },
      age: 0.9,
      weight: 0.5,
      asym: 0.6,
      tone: {
        base: [0.64, 0.42, 0.29],
        flush: [0.76, 0.33, 0.24],
        lips: [0.54, 0.25, 0.22],
        cool: [0.5, 0.39, 0.37],
        cavity: [0.27, 0.14, 0.09],
      },
      eyes: { iris: [0.36, 0.26, 0.14] },
      mouth: 0,
      complexion: { freckles: 0.35 },
      // A smith: forge-reddened, weathered skin, an old burn line over the nose and a cut on
      // the forehead, soot in the creases.
      wear: {
        sun: 0.75,
        freckles: 0.55,
        grime: 0.55,
        wind: 0.85,
        scars: [
          [off(MIDLINE.rhinion, [0, -0.012, 0.004]), off(MIDLINE.rhinion, [0.001, 0.012, -0.003])],
          [off(MIDLINE.forehead, [0, 0.02, -0.03]), off(MIDLINE.forehead, [0, 0.036, -0.012])],
        ],
      },
    },
    hair: { cut: 'short', beard: 'full', root: [0.36, 0.16, 0.06], tip: [0.62, 0.34, 0.14] },
    plinth: STONE,
    // A smith's madder-red wool under a brass-studded leather collar, ash on the shoulders.
    garment: { cloth: [0.36, 0.09, 0.05], trim: [0.42, 0.28, 0.1], dust: 0.6 },
  },
  goblin: {
    character: {
      race: {
        ...GOBLIN,
        eyes: { ...GOBLIN.eyes, size: 1.42 },
        nose: { ...GOBLIN.nose, hook: GOBLIN.nose.hook + 0.012 },
        brow: { forward: 0.035, height: -0.004 },
      },
      warts: 7,
      teeth: 'sharp',
      age: 0.3,
      weight: -0.3,
      asym: 1,
      tone: {
        base: [0.33, 0.4, 0.13],
        flush: [0.48, 0.33, 0.13],
        lips: [0.3, 0.2, 0.11],
        cool: [0.25, 0.31, 0.18],
        cavity: [0.1, 0.12, 0.04],
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
    // Sackcloth with a rope collar, filthy.
    garment: { cloth: [0.33, 0.28, 0.17], trim: [0.22, 0.17, 0.1], dust: 0.8, vee: 0.015 },
  },
};
