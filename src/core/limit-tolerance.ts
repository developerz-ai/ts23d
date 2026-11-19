// A joint limit's declared deform tolerance: how far QA `deform` lets an edge round that joint
// stretch at the limit (qa/deform.ts). Default ×4; a recipe may raise it to the hard cap only with
// a `why`, on the limit itself (`ctx.bone(…, { limit: { …, stretch, why } })`) or, for limits a
// kind generates, by bone name (`limitTolerances` on the asset). Same rule as every tolerance
// here (validate-asset.ts `checkTolerance`): a loose number is a recorded decision, not a fudge.

import { Ts23dError } from './errors.ts';
import type { Bone, JointLimit, LimitTolerance } from './skeleton.ts';

/**
 * Edge stretch at a joint limit, posed ÷ rest. Default: a smooth blend smears ≤ ×3.5 at a limb
 * root. Cap: at ×6 a 2 cm edge spans 12 cm, a sheet anyone sees; a skin on the wrong bone tears
 * ×10 and more, which no declaration may excuse.
 */
export const STRETCH_TOLERANCE = { default: 4, max: 6 } as const;

const invalid = (cause: string, fix: string): never => {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause, fix });
};

const FORM = "stretch: 5, why: 'the mesh fuses the tail to the thigh; re-generate it (follow-up)'";

/** `stretch` is finite in [1, max]; above the default it needs a non-empty `why`. */
export function checkStretch(where: string, l: Pick<JointLimit, 'stretch' | 'why'>): void {
  const s = l.stretch;
  if (s === undefined) return;
  const { default: dflt, max } = STRETCH_TOLERANCE;
  if (!(Number.isFinite(s) && s >= 1 && s <= max))
    invalid(
      `${where}: limit stretch tolerance ${s} is outside [1, ${max}]`,
      `use a ratio of edge lengths: ${dflt} is the default; over ×${max} the skin is torn, fix the mesh or weights instead`,
    );
  if (s > dflt && !l.why?.trim())
    invalid(
      `${where}: limit stretch tolerance ${s} is above the ×${dflt} default without a why`,
      `say why that joint may stretch further: limit: { …, ${FORM} }`,
    );
}

/** The bones with each named tolerance written onto that bone's limit (validated there). */
export function withTolerances(
  asset: string,
  bones: readonly Bone[],
  tolerances: Readonly<Record<string, LimitTolerance>> = {},
): Bone[] {
  const names = new Set(bones.map((b) => b.name));
  for (const [name, t] of Object.entries(tolerances)) {
    const b = bones.find((x) => x.name === name);
    if (!b?.limit)
      invalid(
        `'${asset}' limitTolerances.${name}: ${names.has(name) ? 'that bone has no joint limit' : 'no bone of that name'}`,
        `name a bone with a limit, e.g. limitTolerances: { hind_r_0: { ${FORM} } }`,
      );
    checkStretch(`'${asset}' limitTolerances.${name}`, t);
  }
  return bones.map((b) => {
    const t = tolerances[b.name];
    return t && b.limit ? { ...b, limit: { ...b.limit, stretch: t.stretch, why: t.why } } : b;
  });
}
