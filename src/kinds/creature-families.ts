// Animal families from one skeleton: a base species (the grey wolf) plus a member's sourced
// numbers (mass, head-body, shoulder, tail) give the member's CreatureSpec. Same-family members
// keep the base's build and face, scaled allometrically; a member of another family (a bear from
// the wolf) takes that family's preset (stance, face, ears, build) first. The recipe reads its
// numbers from Wikidata or cited sources; this file only scales and checks them.
// Allometry: head length ∝ head-body^0.8 (small carnivores have relatively larger heads; exponent
// an estimate, unverified, checked by each member's sourced head length when given); coat
// thickness ∝ mass^(1/6) (estimate); neck ∝ head-body.

import { Ts23dError } from '../core/index.ts';
import type { CreatureColours, CreaturePattern, CreatureSpec } from './creature-spec.ts';

export type FamilyPresetName = 'canid' | 'felid' | 'ursid';

/** What a family changes about a base body that belongs to another family. */
export interface FamilyPreset {
  readonly stance: NonNullable<CreatureSpec['stance']>;
  readonly face: NonNullable<CreatureSpec['face']>;
  readonly build: NonNullable<CreatureSpec['build']>;
  readonly pose: NonNullable<CreatureSpec['pose']>;
  /** Head length ÷ head-body when the member gives none (head-body-scaled from the family). */
  readonly head: number;
  /** Neck ÷ head-body. */
  readonly neck: number;
}

export const FAMILY_PRESETS: Readonly<Record<FamilyPresetName, FamilyPreset>> = {
  // Grey wolf (recipes/wolf): skull 0.265 on 1.15 m; neck 0.28 m.
  canid: {
    stance: 'digitigrade',
    face: { preset: 'canid', ears: 'erect', pupil: 'round' },
    build: { depth: 0.5, width: 0.55, limbs: 1, tuck: 0.66 },
    pose: { head: 12, neck: 40, tail: 'hang' },
    head: 0.23,
    neck: 0.24,
  },
  // Tiger/cat: short round muzzle, deep chest, lower-slung body (recipes/amur_tiger).
  felid: {
    stance: 'digitigrade',
    face: { preset: 'felid', ears: 'round', pupil: 'round' },
    build: { depth: 0.55, width: 0.7, limbs: 1.1, tuck: 0.72 },
    pose: { head: 10, neck: 30, tail: 'hang' },
    head: 0.17,
    neck: 0.16,
  },
  // Brown bear: plantigrade, broad head (skull 0.315–0.455 m on 1.0–2.8 m head-body, Wikipedia:
  // Brown bear), short thick neck, the muscle hump over the shoulders, barrel chest, no tuck.
  ursid: {
    stance: 'plantigrade',
    face: { preset: 'ursid', ears: 'round', pupil: 'round', fangs: false },
    build: { depth: 0.6, width: 0.85, limbs: 1, tuck: 0.92, ruff: 0.05, tailGirth: 1 },
    pose: { head: 18, neck: 18, tail: 'hang' },
    head: 0.19,
    neck: 0.12,
  },
};

/** One family member's sourced numbers; anything not given is scaled from the base. */
export interface FamilyMember {
  readonly family: FamilyPresetName;
  readonly mass: number;
  /** Head + body, nose → tail root, metres. */
  readonly length: number;
  /** Shoulder height, metres. */
  readonly height: number;
  readonly tail?: number;
  readonly head?: number;
  /** Ear height, metres (→ face.earLength). */
  readonly ear?: number;
  readonly colours: CreatureColours;
  readonly pattern?: CreaturePattern;
  /** Field-level overrides applied last (build, face, pose, coat…). */
  readonly overrides?: Partial<CreatureSpec>;
}

const bad = (cause: string, fix: string): never => {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause: `family member: ${cause}`, fix });
};

/** Head length of a member: sourced, else the base's head scaled by head-body^0.8 (same family)
 *  or the target family's head share. */
export function memberHead(base: CreatureSpec, m: FamilyMember): number {
  if (m.head !== undefined) return m.head;
  const same = base.family === m.family;
  if (same && base.head !== undefined) return base.head * (m.length / base.length) ** 0.8;
  return FAMILY_PRESETS[m.family].head * m.length;
}

/**
 * The member's spec from the base's skeleton. Refuses numbers no living animal has: the
 * shoulder above the head-body length, or a mass whose density (mass ÷ length × height²) is
 * more than 3× off the base's (a typo in kg vs g, or a body from another species).
 */
export function familyMember(base: CreatureSpec, m: FamilyMember): CreatureSpec {
  if (base.skeleton !== 'quadruped')
    bad(`base skeleton is '${base.skeleton}'`, 'derive members from a quadruped (the wolf)');
  for (const [k, v] of [
    ['mass', m.mass],
    ['length', m.length],
    ['height', m.height],
  ] as const)
    if (!(Number.isFinite(v) && v > 0)) bad(`${k} is ${v}`, `give ${k} from the dossier, > 0`);
  if (m.height >= m.length)
    bad(
      `shoulder ${m.height} m ≥ head-body ${m.length} m`,
      'height is the shoulder height; length is nose → tail root',
    );
  const bulk = (s: { mass: number; length: number; height: number }): number =>
    s.mass / (s.length * s.height * s.height);
  const k = bulk(m) / bulk(base);
  if (k > 3 || k < 1 / 3)
    bad(
      `mass ${m.mass} kg on ${m.length} × ${m.height} m is ${k.toFixed(2)}× the base's bulk`,
      'check the units (kg, metres) and that the numbers are one animal',
    );
  const same = base.family === m.family;
  const p = FAMILY_PRESETS[m.family];
  const scale = m.length / base.length;
  const head = memberHead(base, m);
  const coat = (base.coat ?? 0.02) * (m.mass / base.mass) ** (1 / 6);
  const face = same ? { ...base.face } : { ...p.face };
  const build = same ? { ...base.build } : { ...p.build };
  // Base fields that belong to the base species, not the member: dropped, then re-derived.
  const { tail: _t, pattern: _p, digits, foreShare, hoof, fur, ...rest } = base;
  const spec: CreatureSpec = {
    ...rest,
    ...(same && digits ? { digits } : {}),
    ...(same && foreShare ? { foreShare } : {}),
    ...(same && hoof ? { hoof } : {}),
    ...(same && fur ? { fur } : {}),
    family: m.family,
    stance: same ? (base.stance ?? p.stance) : p.stance,
    mass: m.mass,
    length: m.length,
    height: m.height,
    head,
    neck: same && base.neck !== undefined ? base.neck * scale : p.neck * m.length,
    ...(m.tail !== undefined ? { tail: m.tail } : {}),
    build: {
      ...build,
      ...(build.ruff !== undefined ? { ruff: build.ruff * (m.mass / base.mass) ** (1 / 6) } : {}),
    },
    face: { ...face, ...(m.ear !== undefined ? { earLength: m.ear / head } : {}) },
    coat,
    colours: m.colours,
    pose: same ? { ...base.pose } : { ...p.pose },
    ...(m.pattern ? { pattern: m.pattern } : {}),
  };
  return { ...spec, ...m.overrides };
}
