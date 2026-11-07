// Head kind parameters: the typed knobs of a stylised head, in HEAD UNITS (1 = chin to crown of a
// human-proportioned skull; the builder scales by `height` metres at the end), plus the guard that
// turns an unusable set into a T3D_RECIPE_INVALID with the fix.

import { Ts23dError, type Vec3 } from '../core/index.ts';

export type EarShape = 'round' | 'pointed';
export type HairStyle = 'none' | 'topknot' | 'mohawk' | 'swept' | 'tufts' | 'braids';
export type BeardStyle = 'none' | 'short' | 'braided' | 'goatee';
export type BustStyle = 'pauldrons' | 'hood' | 'tunic' | 'vest';

export interface HeadColors {
  readonly skin: Vec3;
  /** Darker skin: lips edge, nostrils, inner ear, wrinkles. */
  readonly shade: Vec3;
  readonly lips: Vec3;
  readonly sclera: Vec3;
  readonly iris: Vec3;
  readonly pupil: Vec3;
  readonly teeth: Vec3;
  readonly mouth: Vec3;
  readonly hair: Vec3;
  readonly cloth: Vec3;
  readonly leather: Vec3;
  readonly metal: Vec3;
  /** Cloak / mantle over the shoulders; default `leather`. */
  readonly cape?: Vec3;
  /** Fur trim on the bust (mantle, hood lining); default `leather`. */
  readonly fur?: Vec3;
  /** War paint / tattoo stripes (orc), or none. */
  readonly paint?: Vec3;
  /** The bust's plinth (stone/wood socle); default a dark slate. */
  readonly plinth?: Vec3;
  /** Scarf / sash cloth (vest style); default `cloth`. */
  readonly scarf?: Vec3;
}

export interface HeadParams {
  /** Chin to crown, metres (adult human ≈ 0.23). */
  readonly height: number;
  /** Full width / depth of the brain case; `height` = crown above the eye line. */
  readonly cranium: { readonly width: number; readonly depth: number; readonly height: number };
  /** Ridge radius, how far it juts past the eyes, and the scowl (inner ends lowered). */
  /** Ridge radius, overhang past the eyes, scowl (inner ends lowered), eyebrow hair radius
   *  (omit or 0 = no eyebrows). */
  readonly brow: {
    readonly ridge: number;
    readonly overhang: number;
    readonly scowl: number;
    readonly hair?: number;
  };
  readonly cheeks: { readonly size: number; readonly width: number };
  /** Half-width at the jaw angle, chin size, lower-jaw jut past the upper lip, chin drop,
   *  muzzle (how far mouth and jaw push forward of the brow: prognathism). */
  readonly jaw: {
    readonly muzzle: number;
    readonly width: number;
    readonly chin: number;
    readonly underbite: number;
    readonly drop: number;
  };
  /** Eye line → nose base, nostril half-width, tip radius, hook (droop), bridge projection. */
  readonly nose: {
    readonly length: number;
    readonly width: number;
    readonly tip: number;
    readonly hook: number;
    readonly bridge: number;
  };
  /** Length (root → tip), width, sweep back (deg), tilt up (deg). */
  readonly ears: {
    readonly shape: EarShape;
    readonly length: number;
    readonly width: number;
    readonly sweep: number;
    readonly lift: number;
  };
  /** Eyeball radius, centre-to-midline, eye line (fraction of height), lid angles (deg). */
  readonly eyes: {
    readonly radius: number;
    readonly spacing: number;
    readonly line: number;
    readonly lid: number;
    readonly lowerLid: number;
  };
  /** Half-width, lip thickness, grin (0 = closed line, 1 = wide toothy smile). */
  readonly mouth: { readonly width: number; readonly lips: number; readonly grin: number };
  readonly tusks: {
    readonly length: number;
    readonly radius: number;
    readonly spread: number;
    readonly flare: number;
  } | null;
  readonly neck: { readonly radius: number };
  /** Shoulder half-span, gear style, muscle mass (0 = bony and narrow … 1 = brute; default 0.5). */
  readonly bust: { readonly shoulders: number; readonly style: BustStyle; readonly mass?: number };
  readonly hair: HairStyle;
  readonly beard: BeardStyle;
  /** Wart / bump count scattered on the skin (seeded). */
  readonly warts: number;
  /** Forehead creases (0 = smooth; a goblin's worried brow has 3). */
  readonly wrinkles?: number;
  readonly colors: HeadColors;
}

const bad = (cause: string, fix: string): never => {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause, fix });
};

/** Every number in a params object, with its path, for the finite/positive sweep. */
function numbers(o: unknown, path: string, out: Array<[string, number]>): void {
  if (typeof o === 'number') out.push([path, o]);
  else if (o && typeof o === 'object' && !Array.isArray(o))
    for (const [k, v] of Object.entries(o)) numbers(v, path ? `${path}.${k}` : k, out);
}

const SIGNED = new Set([
  'brow.scowl',
  'jaw.underbite',
  'nose.hook',
  'ears.lift',
  'ears.sweep',
  'nose.bridge',
]);
const ZERO_OK = new Set([
  'mouth.grin',
  'warts',
  'jaw.drop',
  'jaw.muzzle',
  'brow.overhang',
  'brow.hair',
  'bust.mass',
  'wrinkles',
]);

/** Throws T3D_RECIPE_INVALID (with a fix) when `p` cannot make a head. */
export function checkHead(p: HeadParams): HeadParams {
  if (!(p.height >= 0.05 && p.height <= 3))
    bad(`head height ${p.height} m`, 'give height in metres, chin to crown: human 0.23, orc ≈ 0.3');
  const flat: Array<[string, number]> = [];
  numbers({ ...p, colors: undefined, height: undefined }, '', flat);
  for (const [k, v] of flat) {
    if (!Number.isFinite(v)) bad(`head param ${k} is ${v}`, 'use finite numbers (head units)');
    if (SIGNED.has(k)) continue;
    if (v < 0 || (v === 0 && !ZERO_OK.has(k)))
      bad(`head param ${k} is ${v}`, `make ${k} > 0 (head units: 1 = chin to crown)`);
  }
  const e = p.eyes;
  if (e.line < 0.3 || e.line > 0.7)
    bad(`eyes.line ${e.line}`, 'keep the eye line between 0.3 and 0.7 of the head height');
  if (e.spacing < e.radius * 1.1)
    bad(
      `eyes.spacing ${e.spacing} < eyes.radius ${e.radius} × 1.1: the eyeballs overlap`,
      'raise eyes.spacing (centre to midline) or shrink eyes.radius',
    );
  if (e.lid <= e.lowerLid * -1 || e.lid > 80)
    bad(`eye lids ${e.lid}°/${e.lowerLid}° leave no opening`, 'use lid in (−lowerLid, 80] degrees');
  if (p.mouth.grin > 1) bad(`mouth.grin ${p.mouth.grin}`, 'grin runs 0 (closed) … 1 (wide)');
  if (p.tusks && p.tusks.length > 0.6)
    bad(`tusks.length ${p.tusks.length}`, 'tusks longer than 0.6 head units read as horns');
  return p;
}
