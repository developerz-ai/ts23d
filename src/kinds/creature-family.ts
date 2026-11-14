// Biology per animal family, each number with its source (docs/research/animal-anatomy.md,
// animal-species-sheets.md): orbit convergence (which way the eye openings face), digits per foot
// and the hoof type, the tail ÷ head-body ratio, and the share of standing weight the forelegs
// carry. `familyOf(spec)` resolves `family` (or a head preset naming one) to these defaults; the
// spec's explicit fields always win.
// Sources: Heesy, Anat. Rec. A 281 (2004) (HEESY04, orbit convergence); Wikipedia Cat, Cattle,
// Brown bear, Red deer, Wolf, Siberian tiger pages (digits, tails); PubMed 32363786 (DOGW, dog
// 60.4 % fore); Clayton & Hobbs via equimanagement.com (HORSEW, horse 57–60 % fore).

import type { CreatureSpec, HeadPreset, Stance } from './creature-spec.ts';

export type Family = 'canid' | 'felid' | 'ursid' | 'equid' | 'bovid' | 'cervid' | 'suid';
/** Unguligrade foot: one hoof (equids, digit III) or two hoofed digits III + IV (artiodactyls). */
export type Hoof = 'single' | 'cloven';

export const FAMILY_NAMES: readonly Family[] = [
  'canid',
  'felid',
  'ursid',
  'equid',
  'bovid',
  'cervid',
  'suid',
];

export interface FamilyBiology {
  /** Head numbers (HEAD_PRESETS key). */
  readonly head: HeadPreset;
  /** Orbit convergence, degrees from the midline (90 = facing forward). The lid aperture faces
   *  90° − this off +X. */
  readonly orbit: number;
  /** Digits per fore / hind paw, dewclaws included (unused for hoofed feet). */
  readonly fore: number;
  readonly hind: number;
  readonly hoof: Hoof | null;
  /** Tail ÷ head-body length. */
  readonly tail: number;
  /** Allowed share of standing weight on the forelegs, [low, high]. */
  readonly foreShare: readonly [number, number];
}

/** Quadruped mammals in general: the dog band (DOGW mean 0.604; animal-anatomy §9 0.55–0.66). */
export const MAMMAL_FORE_SHARE = [0.55, 0.66] as const;

export const FAMILIES: Readonly<Record<Family, FamilyBiology>> = {
  // Dog/wolf 50.4° (HEESY04); 5 fore (dewclaw) / 4 hind (animal-anatomy §2); wolf tail 0.37 HB.
  canid: {
    head: 'canid',
    orbit: 50.4,
    fore: 5,
    hind: 4,
    hoof: null,
    tail: 0.37,
    foreShare: MAMMAL_FORE_SHARE,
  },
  // Cat 65.4° (HEESY04); 5 fore / 4 hind (Wikipedia: Cat); tail: tiger 0.51 HB (cat 0.65, lion
  // 0.45: override `tail` per species). Fore share: no felid source, the mammal band.
  felid: {
    head: 'felid',
    orbit: 65.4,
    fore: 5,
    hind: 4,
    hoof: null,
    tail: 0.51,
    foreShare: MAMMAL_FORE_SHARE,
  },
  // Bears: 5 / 5 plantigrade (animal-anatomy §2, practitioner consensus); tail 0.06–0.22 m on
  // 1.0–2.8 m HB ≈ 0.07 (Wikipedia: Brown bear).
  // Orbit unsourced (no ursid in HEESY04): the caniform value of the dog.
  ursid: {
    head: 'ursid',
    orbit: 50.4,
    fore: 5,
    hind: 5,
    hoof: null,
    tail: 0.07,
    foreShare: MAMMAL_FORE_SHARE,
  },
  // Horse 24.4° (HEESY04); one hoof (digit III); dock ≈ 0.5 m on ≈ 2.4 m HB ≈ 0.21 (estimate,
  // unverified); fore share 0.57–0.60 (HORSEW) → band 0.55–0.62 (animal-anatomy §9).
  equid: {
    head: 'ungulate',
    orbit: 24.4,
    fore: 1,
    hind: 1,
    hoof: 'single',
    tail: 0.21,
    foreShare: [0.55, 0.62],
  },
  // Cattle walk on two toes III + IV, dewclaws II + V (Wikipedia: Cattle); tail ≈ 0.9 m on
  // ≈ 2.5 m HB ≈ 0.36 (estimate). Orbit: not in HEESY04; binocular 30–50° like the horse's, so
  // the horse value.
  bovid: {
    head: 'ungulate',
    orbit: 24.4,
    fore: 2,
    hind: 2,
    hoof: 'cloven',
    tail: 0.36,
    foreShare: MAMMAL_FORE_SHARE,
  },
  // Red deer: cloven like cattle; tail 0.12–0.19 m on 1.8–2.0 m HB ≈ 0.075 (Wikipedia: Red deer).
  // Orbit: the lateral-eyed ungulate value of the horse (no cervid in HEESY04).
  cervid: {
    head: 'ungulate',
    orbit: 24.4,
    fore: 2,
    hind: 2,
    hoof: 'cloven',
    tail: 0.075,
    foreShare: MAMMAL_FORE_SHARE,
  },
  // Wild boar: cloven, dewclaws low (Wikipedia: Wild boar); tail ≈ 0.2–0.3 m on ≈ 1.5 m ≈ 0.17
  // (estimate). Orbit: the ungulate value (unsourced for suids).
  suid: {
    head: 'ungulate',
    orbit: 24.4,
    fore: 2,
    hind: 2,
    hoof: 'cloven',
    tail: 0.17,
    foreShare: MAMMAL_FORE_SHARE,
  },
};

/** The spec's family: `family`, else a head preset that names one (`canid`, `felid`, `ursid`). */
export function familyOf(s: CreatureSpec): FamilyBiology | null {
  const name = s.family ?? s.face?.preset;
  return name && name in FAMILIES ? FAMILIES[name as Family] : null;
}

/** Orbit convergence (degrees) of a spec: face.orbit, the family's, else a carnivore-like 50°. */
export function orbitOf(s: CreatureSpec): number {
  return s.face?.orbit ?? familyOf(s)?.orbit ?? FAMILIES.canid.orbit;
}

export interface FootPlan {
  /** Clawed digits on the ground (0 for a hoof). */
  readonly toes: number;
  /** Digits carried off the ground: the dog/cat fore digit I, the artiodactyl II + V. */
  readonly dewclaws: number;
  readonly hoof: Hoof | null;
}

/** Digits of one foot from the spec, family and stance. Stance defaults without a family:
 *  digitigrade 5 fore / 4 hind (cat, dog), plantigrade 5 / 5 (bear, human), unguligrade one hoof. */
export function footPlan(s: CreatureSpec, stance: Stance, leg: 'fore' | 'hind'): FootPlan {
  const fam = familyOf(s);
  if (stance === 'unguligrade') {
    const hoof = s.hoof ?? fam?.hoof ?? 'single';
    return { toes: 0, dewclaws: hoof === 'cloven' ? 2 : 0, hoof };
  }
  const n = s.digits?.[leg] ?? fam?.[leg] ?? (stance === 'digitigrade' && leg === 'hind' ? 4 : 5);
  // Digitigrade: four weight-bearing toes; a fifth is digit I, the dewclaw high on the inside.
  if (stance === 'digitigrade' && n > 4) return { toes: 4, dewclaws: n - 4, hoof: null };
  return { toes: n, dewclaws: 0, hoof: null };
}
