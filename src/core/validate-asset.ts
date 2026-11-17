// Definition and option checks: a recipe input that cannot produce a valid asset fails at
// defineAsset / compile with T3D_RECIPE_INVALID + fix, instead of building wrong geometry.
// Also the default tolerances the QA gates and joints read, so the cap and the `why` rule agree.

import type { AssetDefinition, Measure } from './definition.ts';
import { Ts23dError } from './errors.ts';
import type { Mesh } from './mesh.ts';
import type { Lod, Part, PartOptions } from './part.ts';
import { checkSeed } from './rng.ts';
import {
  checkTextureSet,
  sameTextureSet,
  TEXTURE_SIZES,
  type TextureBudget,
  type TextureSet,
  textureInvalid,
} from './texture-set.ts';

/** Default relative tolerances (QA `measures`, `proportions`, `joints`) and the hard cap. */
export const TOLERANCE = { measure: 0.02, proportions: 0.05, joint: 0.2, max: 0.5 } as const;

/** The merged static root node of every exported GLB (export `mergeToPivots`). */
export const ROOT_PART = 'body';

const invalid = (cause: string, fix: string): never => {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause, fix });
};

/**
 * A tolerance is finite, in (0, TOLERANCE.max]; above its default it needs a non-empty `why`
 * so a loose number is a recorded decision, never a fudge to make a gate pass.
 */
export function checkTolerance(
  t: number | undefined,
  dflt: number,
  why: string | undefined,
  where: string,
): void {
  if (t === undefined) return;
  if (!(Number.isFinite(t) && t > 0 && t <= TOLERANCE.max))
    invalid(
      `${where} tolerance ${t} is outside (0, ${TOLERANCE.max}]`,
      `use a fraction: ${dflt} = ±${dflt * 100}% (the default); re-derive the number from the sources rather than widening it`,
    );
  if (t > dflt && !why?.trim())
    invalid(
      `${where} tolerance ${t} is above the ${dflt} default without a why`,
      `say why it may be that loose: tolerance: ${t}, why: 'stylised design, no spec sheet'`,
    );
}

const positive = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v > 0;

function checkMeasure(asset: string, m: Measure): void {
  const where = `'${asset}' measure '${m.label}'`;
  if (!positive(m.value))
    invalid(`${where} value ${m.value} is not a positive length`, 'give the spec value in metres');
  checkTolerance(m.tolerance, TOLERANCE.measure, m.why, where);
}

/** Every definition-time check: name, budget, seed, real dimensions and measures. */
export function checkAsset(def: AssetDefinition): void {
  if (typeof def.name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(def.name))
    invalid(
      `asset name '${def.name}' is not snake_case`,
      'rename it to [a-z][a-z0-9_]* — it becomes the GLB file name and the root node',
    );
  const name = def.name;
  const tris = def.budget?.triangles;
  if (!Array.isArray(tris) || tris.length !== 3 || !tris.every(positive))
    invalid(
      `'${name}' has no budget with three positive triangle ceilings`,
      'declare one: budget: BUDGETS.prop, or budget: { triangles: [5000, 1500, 300] }',
    );
  const draws = def.budget.draws;
  if (draws !== undefined && !(Number.isInteger(draws) && draws >= 1))
    invalid(
      `'${name}' budget.draws ${draws} is not an integer ≥ 1`,
      'use e.g. draws: 4, or omit it',
    );
  checkTextureBudget(name, def.budget.textureSets);
  if (def.seed !== undefined) checkSeed(def.seed, `'${name}' seed`);
  const real = def.real;
  if (!real) return;
  for (const axis of ['length', 'width', 'height'] as const)
    if (!positive(real[axis]))
      invalid(
        `'${name}' real.${axis} ${real[axis]} is not a positive length`,
        'give the overall dimension in metres from the sources',
      );
  checkTolerance(real.tolerance, TOLERANCE.proportions, real.why, `'${name}' real`);
  for (const m of real.measures ?? []) checkMeasure(name, m);
}

/** `compile(asset, { lod, seed })`: a LOD that exists and an integer seed. */
export function checkCompileOptions(name: string, lod: number, seed: number): asserts lod is Lod {
  if (lod !== 0 && lod !== 1 && lod !== 2)
    invalid(`compile('${name}') with lod ${lod}`, 'pass lod 0, 1 or 2 (LOD0 is the most detailed)');
  checkSeed(seed, `compile('${name}') seed`);
}

/** `body` names the merged static root: a pivot (group, moving part, emitter…) may not take it. */
export function checkPivotName(
  asset: string,
  name: string,
  mesh: Mesh | null,
  o: PartOptions,
): void {
  if (name === ROOT_PART && (mesh === null || o.motion))
    invalid(
      `'${asset}' declares a pivot named '${ROOT_PART}'`,
      `rename the group; \`${ROOT_PART}\` is the merged static root`,
    );
}

const DECLARE = 'declare budget.textureSets: { count: 1, size: 2048 }';

/** `budget.textureSets`: an integer count ≥ 1 and a size of 1024, 2048 or 4096. */
function checkTextureBudget(asset: string, b: TextureBudget | undefined): void {
  if (b === undefined) return;
  const sized = (TEXTURE_SIZES as readonly number[]).includes(b?.size);
  if (!(Number.isInteger(b?.count) && b.count >= 1 && sized))
    textureInvalid(
      `'${asset}' budget.textureSets is ${JSON.stringify(b)}`,
      `${DECLARE} (count: integer ≥ 1; size: ${TEXTURE_SIZES.join(', ')})`,
    );
}

/**
 * Textured parts (ADR 016) are opt-in, counted and plain: each has a mesh, is opaque or cutout
 * with no paint or finish, its set passes `checkTextureSet` under the declared size, one name
 * means one set of bytes, and the distinct names fit `budget.textureSets.count`.
 */
export function checkTexturedParts(
  asset: string,
  parts: readonly Part[],
  budget: TextureBudget | undefined,
): void {
  const sets = new Map<string, { readonly set: TextureSet; readonly alpha: boolean }>();
  for (const p of parts) {
    const set = p.textures;
    if (set === undefined) continue;
    const where = `part '${p.name}' in '${asset}'`;
    const drop = (what: string, option: string, why: string): never =>
      textureInvalid(`${where} has textures and ${what}`, `drop \`${option}\` from it: ${why}`);
    if (!p.mesh) drop('no mesh', 'textures', 'a group draws nothing; set it on the meshed parts');
    if (p.surface && p.surface !== 'cutout')
      drop(`surface '${p.surface}'`, 'surface', 'a textured part is opaque or cutout');
    if (p.paint !== undefined)
      drop(`paint '${p.paint}'`, 'paint', 'its colour comes from the albedo map');
    if (p.finish !== undefined)
      drop(`finish '${p.finish}'`, 'finish', 'its shading comes from the ORM map or factors');
    if (!budget)
      textureInvalid(`${where} has textures but '${asset}' declares no budget for them`, DECLARE);
    const known = sets.get(set.name);
    if (known && !sameTextureSet(known.set, set))
      textureInvalid(
        `${where} uses texture set '${set.name}' with other maps or factors than an earlier part`,
        'share one TextureSet value between the parts, or give the second set its own name',
      );
    const alpha = known?.alpha ?? checkTextureSet(where, set, budget.size).alpha;
    if (!known) sets.set(set.name, { set, alpha });
    if (p.surface === 'cutout' && !alpha)
      textureInvalid(
        `${where} is cutout but the albedo of '${set.name}' has no alpha channel`,
        "bake the albedo as RGBA (alpha = the mask), or drop `surface: 'cutout'`",
      );
  }
  if (budget && sets.size > budget.count)
    textureInvalid(
      `'${asset}' carries ${sets.size} texture sets (${[...sets.keys()].join(', ')}), budget.textureSets.count is ${budget.count}`,
      `bake the parts into ${budget.count} set(s) (one atlas), or raise count to ${sets.size} with a reason: each set is a material and a draw per pivot`,
    );
}
