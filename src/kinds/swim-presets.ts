// Swimming parameters with their sources (docs/research/swim-and-tentacle-animation.md section 1;
// tags are that document's). Lengths are fractions of body length L. Strouhal St = tailApp / stride
// and slip = stride / lambda follow from these; nothing here sets them separately.

export interface SwimParams {
  /** Body wavelength, L. */
  readonly lambda: number;
  /** Body lengths travelled per tail beat, U / (f L). */
  readonly stride: number;
  /** Peak-to-peak tail excursion, L. */
  readonly tailApp: number;
  /** Head term of the quadratic envelope, L (the fit's 0.05). */
  readonly headApp?: number;
  /** Exponential envelope rates, slow and fast; omitted = the [DS21] quadratic. */
  readonly alpha?: { readonly cruise: number; readonly burst: number };
  /** 'ram' keeps swimming when idle, 'hover' holds station on its fins. */
  readonly idle: 'ram' | 'hover';
  /** Fast-start duration against a teleost's (1 = same). */
  readonly startSlow: number;
  /** Tail beats per second; omitted = the size band below. */
  readonly cruiseHz?: number;
  readonly burstHz?: number;
}

export type SwimPreset = 'shark' | 'tuna' | 'trout' | 'eel';

/** [LD15] says sharks are slower and more variable in a fast start, with no factor: 1.5 is ours. */
const SHARK_START_SLOW = 1.5;

export const SWIM_PRESETS: Readonly<Record<SwimPreset, SwimParams>> = {
  // Subcarangiform wave 0.93 L [DS21, LD15]; stride 0.7 and tail 0.2 L [SR23]: St 0.286, slip 0.75.
  shark: { lambda: 0.93, stride: 0.7, tailApp: 0.2, idle: 'ram', startSlow: SHARK_START_SLOW },
  // Wave 1.17 L, median tail 0.18 L [DS21]; stride 0.7 [SR23]: St 0.257, slip 0.60. A long wave
  // makes recoil add to the head. headApp 0.035 is our pick (design), not a tuna measurement: inside
  // the all-species 0.02 to 0.05 head quartiles [DS21], it measures 0.315 to 0.335 of the tail.
  tuna: { lambda: 1.17, stride: 0.7, tailApp: 0.18, headApp: 0.035, idle: 'ram', startSlow: 1 },
  // Wave 1.00 L, median tail 0.18 L [DS21]; stride 0.7 [SR23]: St 0.257, slip 0.70.
  trout: { lambda: 1, stride: 0.7, tailApp: 0.18, idle: 'hover', startSlow: 1 },
  // Wave 0.597 L, tail half-excursion 0.07 L, α 3.90 to 2.25 [T04]; stride 0.43 [D]: St 0.326.
  eel: {
    lambda: 0.597,
    stride: 0.43,
    tailApp: 0.14,
    alpha: { cruise: 3.9, burst: 2.25 },
    idle: 'hover',
    startSlow: 1,
  },
};

/** Slow bound: min(1.9 Hz, 2 m/s ÷ L). The bounds are [SR23]; the `min` blend is the doc's. */
export const cruiseBand = (L: number): number => Math.min(1.9, 2 / L);

/** Fast bound: min(22 Hz, 9 m/s ÷ L) [SR23]. */
export const burstBand = (L: number): number => Math.min(22, 9 / L);
