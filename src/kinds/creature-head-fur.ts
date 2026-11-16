// Head fur as strand cards, in the head part's own frame (+X to the nose, origin at the occiput):
// short on skull and muzzle (12–20 mm), a cheek ruff behind the jaw flaring back and out (to
// ~65 mm), none on the nose leather, lips, eye rims or above the ear roots. Same two layers and
// strip as the body coat (creature-fur.ts); its own `head_fur` part so it turns with the head.

import type { Mesh, Vec3 } from '../core/index.ts';
import { CREATURE_MATERIALS, defineMaterial } from '../material/index.ts';
import { hairCards, hairFlow } from '../passes/index.ts';
import { type FurOptions, layers, smooth } from './creature-fur.ts';
import { type CreatureSpec, faceOf } from './creature-spec.ts';

/** Where the head stays bare (nose leather, lips, eyes), in the head's own frame. */
export interface HeadBare {
  readonly nose: Vec3;
  readonly noseR: number;
  readonly eye: Vec3;
  readonly eyeR: number;
  /** Lip line height and the x where the muzzle starts. */
  readonly lips: number;
  readonly muzzle: number;
  /** Height of the ear roots: no cards above it (ear backs keep the sculpt's short fur). */
  readonly ears?: number;
}

/** Fur cards over the head mesh in its own frame (+X to the nose), or null at LOD2. */
export function creatureHeadFur(
  head: Mesh,
  spec: CreatureSpec,
  bare: HeadBare,
  o: FurOptions,
): Mesh | null {
  if (o.lod === 2 || (spec.surface ?? 'fur') !== 'fur') return null;
  defineMaterial(CREATURE_MATERIALS.fur_clumps);
  const scale = Math.max(0.3, (spec.coat ?? 0.02) / 0.03);
  const dist = (p: Vec3, q: Vec3): number =>
    Math.hypot(p[0] - q[0], Math.abs(p[1]) - Math.abs(q[1]), p[2] - q[2]);
  const isBare = (p: Vec3): boolean =>
    p[2] > (bare.ears ?? Infinity) ||
    dist(p, bare.nose) < bare.noseR * 1.4 ||
    dist(p, bare.eye) < bare.eyeR * 1.45 ||
    (p[0] > bare.muzzle && Math.abs(p[2] - bare.lips) < bare.noseR * 0.5);
  // Short on muzzle and skull, the cheek ruff behind the jaw longest.
  const ruff = (p: Vec3): number =>
    smooth(bare.muzzle, bare.muzzle * 0.2, p[0]) * smooth(bare.eye[2], bare.lips, p[2]);
  const len = (p: Vec3): number => 0.012 + 0.008 * smooth(bare.muzzle, 0, p[0]) + 0.045 * ruff(p);
  const base = layers(o, scale, len, (p) => (isBare(p) ? 0 : 0.4 + 2 * ruff(p))).map((z) => ({
    ...z,
    density: (p: Vec3, n: Vec3) => (isBare(p) ? 0 : z.density(p, n) * 1.6),
    width: z.width * 0.6,
  }));
  // A full cheek ruff (face.cheek ≥ 0.15: winter wolf) stands off the face and frames it in a front
  // view: its own guard locks, lifted. Shorter-coated heads (fox, preset canid) keep it flat.
  const guard = faceOf(spec).cheek >= 0.15 ? base[base.length - 1] : undefined;
  const zones = guard
    ? [
        ...base,
        {
          ...guard,
          name: 'ruff',
          density: (p: Vec3, n: Vec3) =>
            isBare(p) || ruff(p) < 0.25 ? 0 : guard.density(p, n) * 0.5,
          length: (p: Vec3) => scale * (0.025 + 0.055 * ruff(p)),
          width: guard.width * 1.4,
          lift: 0.4,
        },
      ]
    : base;
  // Lies back from the nose and flares out and down over the cheeks.
  const comb = (p: Vec3): Vec3 => [-1, Math.sign(p[1]) * (0.2 + 0.6 * ruff(p)), -0.2 * ruff(p)];
  const out = hairCards({
    surface: head,
    flow: hairFlow(head, comb),
    zones,
    rng: o.rng.fork('head-fur'),
    segments: o.lod === 0 ? 3 : 2,
    ...(o.field ? { field: o.field } : {}),
  });
  return out.roots.length > 0 ? out.mesh : null;
}
