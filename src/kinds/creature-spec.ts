// The creature spec: what a recipe says about an animal (skeleton type, stance, a few sourced
// proportions, coat), the anatomy defaults per skeleton type (from the dragon and tiger work), and
// validation that refuses impossible specs with T3D_RECIPE_INVALID before any sculpting happens.

import { Ts23dError, type Vec3 } from '../core/index.ts';
import { FAMILIES, FAMILY_NAMES, type Family, type Hoof } from './creature-family.ts';

export type Skeleton = 'quadruped' | 'biped' | 'bird' | 'fish' | 'serpent' | 'winged';
export type Stance = 'digitigrade' | 'plantigrade' | 'unguligrade';
export type EarShape = 'erect' | 'round' | 'none';
export type Surface = 'fur' | 'scales' | 'feathers' | 'skin';
export type PatternKind = 'stripes' | 'spots' | 'rosettes' | 'patches' | 'agouti';
/** Head proportions by family: fills muzzle, width, nose size, stop and cheek fur defaults. */
export type HeadPreset = 'canid' | 'felid' | 'ursid' | 'ungulate';

export const SKELETONS: readonly Skeleton[] = [
  'quadruped',
  'biped',
  'bird',
  'fish',
  'serpent',
  'winged',
];
const STANCES: readonly Stance[] = ['digitigrade', 'plantigrade', 'unguligrade'];

export interface CreatureColours {
  /** Flank colour: the coat's main value. */
  readonly coat: Vec3;
  /** Dorsal saddle / cape (default: coat × 0.7). */
  readonly back?: Vec3;
  /** Countershaded belly, throat, inner legs (default: coat lightened). */
  readonly belly?: Vec3;
  /** Lower legs and feet (default: belly). */
  readonly legs?: Vec3;
  /** Muzzle, cheeks and brow marks (default: belly). */
  readonly muzzle?: Vec3;
  /** Tail tip, ear backs/rims (default: back × 0.6). */
  readonly tip?: Vec3;
  readonly nose: Vec3;
  readonly iris: Vec3;
  /** Claws, hooves, beak, talons. */
  readonly keratin: Vec3;
  /** Pattern marks (stripes, spots…): default near-black. */
  readonly mark?: Vec3;
  /** Dark line down the front of the forelegs, elbow → wrist (grey wolf, many canids). */
  readonly foreline?: Vec3;
  /** Facial mask: round the eyes and over the bridge of the muzzle (default none). */
  readonly mask?: Vec3;
}

export interface CreaturePattern {
  readonly kind: PatternKind;
  /** Mark spacing, metres (stripe pitch, spot spacing, patch size). */
  readonly scale: number;
  /** Share of the coat the marks cover, 0..1 (default 0.35). */
  readonly coverage?: number;
  readonly seed?: number;
}

export interface CreatureSpec {
  readonly skeleton: Skeleton;
  /** Animal family: sourced defaults for orbit angle, digits, hoof, tail and fore share
   *  (creature-family.ts). A head preset naming a family (`canid`, `felid`, `ursid`) implies it. */
  readonly family?: Family;
  /** Legged types only; default per skeleton (quadruped digitigrade, biped plantigrade…). */
  readonly stance?: Stance;
  /** Live mass, kg (the mass gate and allometry read it). */
  readonly mass: number;
  /** Head + body, nose tip → tail root, metres (fish: snout → tail fork; serpent: total). */
  readonly length: number;
  /** Withers (shoulder) height for legged types; body depth for fish; body diameter for serpent. */
  readonly height: number;
  /** Head length, nose → occiput (default per type × length). */
  readonly head?: number;
  readonly neck?: number;
  /** Tail length, metres (default: the family's tail ÷ head-body, else 0.37 × length). */
  readonly tail?: number;
  /** Digits per paw, dewclaws included (default per family; else digitigrade 5 fore / 4 hind,
   *  plantigrade 5 / 5). Digitigrade digits past four are dewclaws, high on the inside. */
  readonly digits?: { readonly fore?: number; readonly hind?: number };
  /** Unguligrade feet: one hoof (horse) or cloven, two hoofed digits + two dewclaws (cattle,
   *  deer, pig). Default per family, else single. */
  readonly hoof?: Hoof;
  /** Allowed share of standing weight on the forelegs (quadrupeds; QA `fore share`). Default per
   *  family, else 0.55–0.66 (dog 0.604, horse 0.57–0.60). */
  readonly foreShare?: readonly [number, number];
  readonly build?: {
    /** Chest depth ÷ shoulder height (default 0.45). */
    readonly depth?: number;
    /** Chest width ÷ chest depth (default 0.62). */
    readonly width?: number;
    /** Limb thickness × the allometric default (1 = Campione & Evans for the mass). */
    readonly limbs?: number;
    /** Tail girth × the default (a bushy wolf tail ≈ 1.6). */
    readonly tailGirth?: number;
    /** Long fur on the nape, throat and chest (a ruff), metres (default 0). */
    readonly ruff?: number;
    /** Abdomen depth at the flank ÷ chest depth: the waist tuck-up (default 0.72; greyhound ≈ 0.4). */
    readonly tuck?: number;
  };
  readonly face?: {
    /** Head family; its numbers are defaults the fields below override (default: `family`'s). */
    readonly preset?: HeadPreset;
    /** Muzzle share of the head length (cat ≈ 0.3, dog/wolf ≈ 0.48, horse ≈ 0.6). */
    readonly muzzle?: number;
    /** Head width ÷ head length (default from the muzzle). */
    readonly width?: number;
    readonly ears?: EarShape;
    /** Ear height ÷ head length (default 0.38 erect, 0.2 round). */
    readonly earLength?: number;
    /** Orbit convergence, degrees from the midline (cat 65.4, dog 50.4, horse 24.4: Heesy 2004).
     *  The lid aperture and the resting gaze face 90° − this off +X. Default per family. */
    readonly orbit?: number;
    /** How far the eyes sit toward the front of the skull, 0..1 (default orbit ÷ 90). */
    readonly forward?: number;
    readonly pupil?: 'round' | 'slit';
    /** Upper canines showing below the lip. */
    readonly fangs?: boolean;
  };
  readonly surface?: Surface;
  /** Effective coat thickness over the skin, metres (mass gate; default fur 0.02, else 0). */
  readonly coat?: number;
  readonly colours: CreatureColours;
  readonly pattern?: CreaturePattern;
  readonly pose?: {
    /** Head carriage, degrees nose-down from level (default 15). */
    readonly head?: number;
    /** Neck angle above level, degrees (default 40). */
    readonly neck?: number;
    readonly tail?: 'hang' | 'level' | 'up';
  };
  /** Wingspan for `winged` / `bird`, metres (default per type). */
  readonly wingspan?: number;
  /** Declares it flies: the wing-loading check then fails a too-small wing. */
  readonly flies?: boolean;
}

/** Defaults per skeleton type: ratios of `length` unless named otherwise. */
export const ANATOMY: Readonly<
  Record<
    Skeleton,
    { stance: Stance; head: number; neck: number; tail: number; muzzle: number; ears: EarShape }
  >
> = {
  // Quadruped tail: the grey wolf's 0.37 of head-body (animal-species-sheets); a family wins.
  quadruped: {
    stance: 'digitigrade',
    head: 0.22,
    neck: 0.2,
    tail: 0.37,
    muzzle: 0.45,
    ears: 'erect',
  },
  winged: { stance: 'digitigrade', head: 0.2, neck: 0.3, tail: 0.7, muzzle: 0.5, ears: 'none' },
  biped: { stance: 'plantigrade', head: 0.18, neck: 0.08, tail: 0, muzzle: 0.3, ears: 'round' },
  bird: { stance: 'digitigrade', head: 0.2, neck: 0.3, tail: 0.35, muzzle: 0.45, ears: 'none' },
  fish: { stance: 'plantigrade', head: 0.24, neck: 0, tail: 0.2, muzzle: 0.3, ears: 'none' },
  serpent: { stance: 'plantigrade', head: 0.035, neck: 0, tail: 0.15, muzzle: 0.45, ears: 'none' },
};

/** Head family numbers (furred heads, ratios of head length L unless named):
 *  muzzle share of L, width ÷ L, nose-tip radius ÷ L, stop (forehead rise over the bridge) ÷ head
 *  height, cheek fur flaring past the cheekbones ÷ width. Canid: grey wolf skull 230–280 × 130–150
 *  mm (Wikipedia: Wolf), nose pad ≈ 4 cm; felid: short round muzzle, broad zygomata; ungulate:
 *  the long equid/bovid face (orbit → muzzle ≈ 0.6–0.7 of the skull). Feet, eyes and tail come
 *  from `family` (creature-family.ts), not from these head numbers. */
export const HEAD_PRESETS: Readonly<
  Record<
    HeadPreset,
    { muzzle: number; width: number; tip: number; stop: number; cheek: number; ears: EarShape }
  >
> = {
  canid: { muzzle: 0.48, width: 0.56, tip: 0.11, stop: 0.16, cheek: 0.12, ears: 'erect' },
  felid: { muzzle: 0.3, width: 0.85, tip: 0.1, stop: 0.08, cheek: 0.22, ears: 'round' },
  ursid: { muzzle: 0.42, width: 0.72, tip: 0.11, stop: 0.12, cheek: 0.15, ears: 'round' },
  ungulate: { muzzle: 0.6, width: 0.42, tip: 0.1, stop: 0.04, cheek: 0, ears: 'erect' },
};

const bad = (cause: string, fix: string): never => {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause: `creature: ${cause}`, fix });
};

const positive = (v: number | undefined, name: string, fix: string): void => {
  if (v !== undefined && !(Number.isFinite(v) && v > 0)) bad(`${name} is ${v}`, fix);
};

const ratio = (v: number | undefined, lo: number, hi: number, name: string): void => {
  if (v !== undefined && !(v >= lo && v <= hi))
    bad(`${name} is ${v}, outside ${lo}..${hi}`, `give ${name} a ratio between ${lo} and ${hi}`);
};

/** Validates a spec; throws T3D_RECIPE_INVALID naming the field and the fix. */
export function checkCreature(s: CreatureSpec): CreatureSpec {
  if (!SKELETONS.includes(s.skeleton))
    bad(`unknown skeleton '${String(s.skeleton)}'`, `use one of ${SKELETONS.join(', ')}`);
  positive(s.mass, 'mass', 'give the live mass in kg, > 0 (a grey wolf: 30–60)');
  positive(s.length, 'length', 'give head + body length in metres, > 0');
  positive(s.height, 'height', 'give shoulder height (legged) or body depth in metres, > 0');
  if (s.mass === undefined || s.length === undefined || s.height === undefined)
    bad('mass, length and height are required', 'declare all three from a sourced dossier');
  positive(s.head, 'head', 'head length in metres, > 0');
  for (const k of ['neck', 'tail'] as const)
    if (s[k] !== undefined && !(Number.isFinite(s[k]) && (s[k] ?? 0) >= 0))
      bad(`${k} is ${s[k]}`, `${k} length in metres, ≥ 0`);
  if (s.stance && !STANCES.includes(s.stance))
    bad(`unknown stance '${String(s.stance)}'`, `use one of ${STANCES.join(', ')}`);
  if (s.stance && (s.skeleton === 'fish' || s.skeleton === 'serpent'))
    bad(`a ${s.skeleton} has no legs, so no stance`, 'drop `stance`');
  if (s.height > s.length * 1.6 && s.skeleton !== 'biped' && s.skeleton !== 'bird')
    bad(
      `height ${s.height} m is over 1.6× length ${s.length} m`,
      'height is the shoulder height (legged) or body depth, length is nose → tail root',
    );
  ratio(s.face?.muzzle, 0.1, 0.75, 'face.muzzle');
  ratio(s.face?.width, 0.25, 1.2, 'face.width');
  ratio(s.face?.earLength, 0.05, 1, 'face.earLength');
  ratio(s.face?.forward, 0, 1, 'face.forward');
  ratio(s.face?.orbit, 0, 90, 'face.orbit');
  if (s.family !== undefined && !FAMILY_NAMES.includes(s.family))
    bad(`unknown family '${String(s.family)}'`, `use one of ${FAMILY_NAMES.join(', ')}`);
  for (const leg of ['fore', 'hind'] as const) {
    const n = s.digits?.[leg];
    if (n !== undefined && !(Number.isInteger(n) && n >= 1 && n <= 5))
      bad(`digits.${leg} is ${n}`, `give whole digits per paw, 1..5 (dog 5 fore / 4 hind, bear 5)`);
  }
  if (s.hoof !== undefined && s.hoof !== 'single' && s.hoof !== 'cloven')
    bad(`unknown hoof '${String(s.hoof)}'`, "use 'single' (horse) or 'cloven' (cattle, deer, pig)");
  if (s.hoof !== undefined && (s.stance ?? ANATOMY[s.skeleton].stance) !== 'unguligrade')
    bad('a hoof needs an unguligrade stance', "set stance: 'unguligrade', or drop `hoof`");
  if (s.foreShare && !(s.foreShare[0] > 0 && s.foreShare[0] < s.foreShare[1] && s.foreShare[1] < 1))
    bad(
      `foreShare is [${s.foreShare.join(', ')}]`,
      'give [low, high] with 0 < low < high < 1 (quadruped mammals ≈ [0.55, 0.66])',
    );
  ratio(s.build?.depth, 0.2, 0.8, 'build.depth');
  ratio(s.build?.width, 0.3, 1.5, 'build.width');
  ratio(s.build?.limbs, 0.2, 4, 'build.limbs');
  ratio(s.build?.tailGirth, 0.2, 4, 'build.tailGirth');
  ratio(s.build?.tuck, 0.3, 1, 'build.tuck');
  if (s.face?.preset && !(s.face.preset in HEAD_PRESETS))
    bad(
      `unknown face.preset '${String(s.face.preset)}'`,
      `use one of ${Object.keys(HEAD_PRESETS).join(', ')}`,
    );
  ratio(s.pose?.head, -30, 70, 'pose.head');
  ratio(s.pose?.neck, -10, 85, 'pose.neck');
  positive(s.coat, 'coat', 'coat thickness in metres (0.01–0.05 for fur)');
  positive(s.wingspan, 'wingspan', 'wingspan in metres, > 0');
  if (s.wingspan !== undefined && s.skeleton !== 'winged' && s.skeleton !== 'bird')
    bad(`a ${s.skeleton} has no wings`, "use skeleton 'winged' or 'bird', or drop `wingspan`");
  if (s.pattern) {
    positive(s.pattern.scale, 'pattern.scale', 'mark spacing in metres, > 0');
    ratio(s.pattern.coverage, 0, 1, 'pattern.coverage');
  }
  for (const k of ['coat', 'nose', 'iris', 'keratin'] as const)
    if (!s.colours?.[k]) bad(`colours.${k} is missing`, `give colours.${k} as linear RGB 0..1`);
  return s;
}

/** The face numbers after preset and skeleton defaults: explicit fields win, then the preset. */
export function faceOf(s: CreatureSpec) {
  const name = s.face?.preset ?? (s.family ? FAMILIES[s.family]?.head : undefined);
  const p = name ? HEAD_PRESETS[name] : null;
  const a = ANATOMY[s.skeleton];
  const muzzle = s.face?.muzzle ?? p?.muzzle ?? a.muzzle;
  return {
    muzzle,
    width: s.face?.width ?? p?.width ?? 0.78 - 0.5 * muzzle,
    ears: s.face?.ears ?? p?.ears ?? a.ears,
    /** Nose-tip radius ÷ head length, or null for the generic rule. */
    tip: p?.tip ?? null,
    stop: p?.stop ?? 0,
    cheek: p?.cheek ?? 0,
  };
}
