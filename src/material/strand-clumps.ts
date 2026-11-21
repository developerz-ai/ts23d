// The clump kinds the strand atlas paints (strands.ts): how many strands a cell holds, how they
// converge into pointed locks, and their tone along the strand. fur (dense short), guard (sparse,
// agouti, dark-tipped), hair (long, fine), wisp (a few strays), beard (wiry) for `fur_clumps` /
// `hair_clumps`; the opt-in lock style's `hair_locks` cells (D461): mass (the dense, dark
// under-layer), lock (one or two pointed locks per card, dark roots, light tips, streaked strand
// to strand), fly (a few long strays), coarse (thick wavy strands: wiry hair, beards).

export type StrandKind =
  | 'fur'
  | 'guard'
  | 'hair'
  | 'wisp'
  | 'beard'
  | 'mass'
  | 'lock'
  | 'fly'
  | 'coarse';

export interface Clump {
  /** Strands per cell (a card shows a clump, not one hair). */
  readonly count: number;
  /** Root radius as a share of the band (≥ 0.03: thinner strands vanish in the alpha mips). */
  readonly width: number;
  /** Roots spread over this share of the band; pull toward the sub-clump tip (0..1). */
  readonly spread: number;
  readonly clump: number;
  /** Sub-clumps per cell (each converges on its own tip) and how much shorter their edges are. */
  readonly subs: number;
  readonly point: number;
  /** Where a strand starts (share of the cell, staggered) and its length range. */
  readonly start: number;
  readonly length: readonly [number, number];
  /** Sideways wave amplitude (share of the band) and waves per cell. */
  readonly wave: number;
  readonly waves: number;
  /** Tone along the strand, [t, linear grey] stops (vertex colour multiplies it). */
  readonly tone: readonly (readonly [number, number])[];
  /** Per-strand value × base + span · random (default 0.72 + 0.5 · r): a wider span streaks. */
  readonly shade?: readonly [number, number];
  /** Fibre roughness in the ORM (default 0.5, a coat): head hair is smoother, so the path
   *  tracer's strand lobes (render/path/hair.ts) give it a sheen band (D525). */
  readonly rough?: number;
}

export const CLUMPS: Readonly<Record<StrandKind, Clump>> = {
  // Undercoat: soft, pale, short locks. Few strands, each ≥ 2 texels at a 2048² sheet, in three
  // locks with gaps between them: a dense cell fills to an opaque lozenge (a chip, D-row).
  fur: {
    count: 9,
    width: 0.06,
    spread: 0.86,
    clump: 0.75,
    subs: 3,
    point: 0.5,
    start: 0.08,
    length: [0.6, 0.9],
    wave: 0.03,
    waves: 1.5,
    tone: [
      [0, 0.72],
      [0.5, 0.95],
      [1, 1.05],
    ],
  },
  // Agouti guard hair (wolf, many canids and rodents): grey base, pale band, darker tip. Two or
  // three pointed locks per cell, separated.
  guard: {
    count: 8,
    width: 0.06,
    spread: 0.8,
    clump: 0.8,
    subs: 3,
    point: 0.5,
    start: 0.06,
    length: [0.8, 1],
    wave: 0.015,
    waves: 1,
    tone: [
      [0, 0.72],
      [0.3, 0.85],
      [0.42, 1.08],
      [0.55, 1.02],
      [0.66, 0.55],
      [1, 0.45],
    ],
  },
  // Head hair: 2–3 locks per card, long, pointed, separated strands.
  hair: {
    count: 16,
    width: 0.034,
    spread: 0.86,
    clump: 0.5,
    subs: 3,
    point: 0.3,
    start: 0.05,
    length: [0.88, 1],
    wave: 0.025,
    waves: 1.2,
    tone: [
      [0, 0.58],
      [0.45, 0.9],
      [1, 1.05],
    ],
    rough: 0.4,
  },
  // Flyaways and outline: a few stray strands, long, barely clumped.
  wisp: {
    count: 6,
    width: 0.032,
    spread: 0.7,
    clump: 0.6,
    subs: 2,
    point: 0.5,
    start: 0.15,
    length: [0.6, 0.95],
    wave: 0.08,
    waves: 1.5,
    tone: [
      [0, 0.7],
      [1, 1.1],
    ],
    rough: 0.4,
  },
  beard: {
    count: 18,
    width: 0.038,
    spread: 0.85,
    clump: 0.4,
    subs: 2,
    point: 0.4,
    start: 0.15,
    length: [0.5, 0.85],
    wave: 0.08,
    waves: 3,
    tone: [
      [0, 0.55],
      [0.6, 0.85],
      [1, 0.95],
    ],
    rough: 0.5,
  },
  // The lock style's under-layer: many strands, barely converging, dark from root to tip, so
  // the gaps between the locks over it read as depth, not as a pale cap.
  mass: {
    count: 14,
    width: 0.045,
    spread: 0.94,
    clump: 0.3,
    subs: 4,
    point: 0.35,
    start: 0.03,
    length: [0.75, 1],
    wave: 0.02,
    waves: 1,
    tone: [
      [0, 0.42],
      [0.5, 0.6],
      [1, 0.72],
    ],
    shade: [0.88, 0.24],
    rough: 0.42,
  },
  // One or two pointed locks per (narrow) card: dark roots, light tips, strands streaked light
  // and dark side by side so the lock reads as hair and catches a highlight as a streak.
  lock: {
    count: 20,
    width: 0.036,
    spread: 0.8,
    clump: 0.75,
    subs: 2,
    point: 0.55,
    start: 0.04,
    length: [0.85, 1],
    wave: 0.02,
    waves: 1,
    tone: [
      [0, 0.42],
      [0.3, 0.7],
      [0.75, 0.95],
      [1, 1.02],
    ],
    shade: [0.88, 0.22],
    rough: 0.4,
  },
  // A few long strays, barely clumped: flyaways over the top and the outline.
  fly: {
    count: 5,
    width: 0.045,
    spread: 0.5,
    clump: 0.2,
    subs: 1,
    point: 0.2,
    start: 0.08,
    length: [0.75, 1],
    wave: 0.1,
    waves: 1.2,
    tone: [
      [0, 0.6],
      [1, 1.1],
    ],
    shade: [0.85, 0.35],
    rough: 0.4,
  },
  // Thick wavy strands with gaps: wiry hair (goblin, orc) and beards.
  coarse: {
    count: 8,
    width: 0.07,
    spread: 0.86,
    clump: 0.35,
    subs: 3,
    point: 0.35,
    start: 0.08,
    length: [0.6, 0.95],
    wave: 0.09,
    waves: 2.5,
    tone: [
      [0, 0.36],
      [0.5, 0.78],
      [1, 1],
    ],
    shade: [0.6, 0.7],
    rough: 0.5,
  },
};
