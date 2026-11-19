// Project materials: `defineMaterial` validates a MaterialDef, gives it the custom strip row it
// names (`row`) or its id hashes to (slots.ts) and adds its recipe to the house table, so a sheet
// painted for an asset that maps onto it shows it (`sheetFor`). Any number of materials may be
// defined, and many may name one row: rows are held per asset, and two on one row in the SAME
// asset is the conflict (found while it compiles, core/material-use.ts). Redefining an id with
// the same definition is a no-op; a different one is a conflict (ids are process-wide names).
// `materialOf` answers what any strip is (built-in or defined) for docs, review and tests;
// `textureSources` / `stripCredits` serve the CC0 image strips (fetch list, GLB credits).

import { Ts23dError } from '../core/index.ts';
import { MATERIAL_LIBRARY } from './library.ts';
import { type MaterialDef, toStripRecipe } from './material-def.ts';
import { NATURE_LIBRARY } from './nature.ts';
import { HOUSE_STRIPS } from './paint/default-sheet.ts';
import type { StripRecipe } from './paint/types.ts';
import { rowsSampled } from './rows-sampled.ts';
import { clearCustom, customIndex, homeSlot, pushCustom } from './slots.ts';
import { creditOf, type TextureSource } from './texture-source.ts';
import {
  CLASSIC_STRIPS,
  CUSTOM_STRIP_SLOTS,
  type CustomStripId,
  STRIPS,
  type StripId,
  stripRow,
  variantOf,
} from './trim-sheet.ts';

const defined = new Map<string, MaterialDef>();
let generation = 0;

/**
 * Bumps whenever the set of defined materials changes. A painted sheet is stale when the
 * generation it was painted at differs: repaint before exporting or rendering (D47).
 */
export function materialGeneration(): number {
  return generation;
}

/** JSON with every object's keys sorted and undefined dropped: equal values, equal text. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value !== 'object' || value === null) return JSON.stringify(value) ?? 'null';
  const fields = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${fields.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

/**
 * The same definition, field by field, whatever order its keys were written in (painters and
 * graphs by identity, colours and params by value).
 */
function same(a: MaterialDef, b: MaterialDef): boolean {
  return (
    canonical({ ...a, paint: 0, graph: 0 }) === canonical({ ...b, paint: 0, graph: 0 }) &&
    a.paint === b.paint &&
    a.graph === b.graph
  );
}

/**
 * Register a project material and return its strip id for `strip:` options.
 * @example
 * const teak = defineMaterial({ id: 'teak_deck', kind: 'planks', roughness: 0.6,
 *   albedo: '#8a5a32', albedo2: '#5a3a1e', params: { width: 0.12, rings: 0.5 } });
 * box({ size: [4, 2, 0.05], strip: teak, color: NATURAL });
 * The strip row is `row` (0..13), else the id's hash. An asset holds one material per row: when
 * two materials of ONE asset share a row its compile throws T3D_MATERIAL_CONFLICT; give one a
 * `row` the asset leaves free. Different assets may reuse any row.
 */
export function defineMaterial(def: MaterialDef): CustomStripId {
  const recipe = toStripRecipe(def);
  const id = def.id;
  if ((STRIPS as readonly string[]).includes(id))
    throw new Ts23dError('T3D_MATERIAL_CONFLICT', {
      cause: `material '${id}' is a built-in strip`,
      fix: `pick another id (e.g. '${id}_custom'), or restyle the built-in via paintTrimSheet({ ...DEFAULT_SHEET, strips: { ...DEFAULT_SHEET.strips, ${id}: … } })`,
    });
  const prior = defined.get(id);
  if (prior) {
    if (same(prior, def)) return id as CustomStripId;
    throw new Ts23dError('T3D_MATERIAL_CONFLICT', {
      cause: `material '${id}' is already defined differently`,
      fix: 'define each material once in a shared module and import it, or give the variant its own id',
    });
  }
  defined.set(id, def);
  generation++;
  pushCustom(id, def.spanMetres ?? 4, def.row ?? homeSlot(id, CUSTOM_STRIP_SLOTS));
  (HOUSE_STRIPS as Record<string, StripRecipe>)[id] = recipe;
  return id as CustomStripId;
}

/**
 * Forget every defined material (tests; long-lived workers that reload recipes). Built-ins stay.
 * Meshes compiled before the reset keep UVs into rows that may be reassigned.
 */
export function resetMaterials(): void {
  const house = HOUSE_STRIPS as Record<string, StripRecipe>;
  for (const id of Object.keys(house)) {
    const base = variantOf(id).base;
    if (defined.has(base) || (base !== id && !(STRIPS as readonly string[]).includes(base)))
      delete house[id];
  }
  defined.clear();
  clearCustom();
  generation++;
}

/**
 * Remember what is defined now; the returned function resets and puts exactly that back. Only
 * definitions present at snapshot time survive: anything defined after it (a test's own fixture
 * materials) is forgotten, so take the snapshot before the file imports a recipe whose materials
 * later files need. For tests that call `resetMaterials()`: recipe modules define their materials
 * once, at import, and are never evaluated again, so without this a later test in the process
 * that compiles such a recipe fails with T3D_MATERIAL_UNKNOWN (D334).
 */
export function materialSnapshot(): () => void {
  const saved = [...defined.values()];
  return () => {
    resetMaterials();
    // One material that cannot come back (its texture provider is gone) must not cost the rest.
    const lost: unknown[] = [];
    for (const def of saved) {
      try {
        defineMaterial(def);
      } catch (e) {
        lost.push(e);
      }
    }
    if (lost.length > 0) throw lost[0];
  };
}

export interface MaterialInfo {
  readonly id: StripId;
  /** classic = greyscale strip tinted by vertex colour; library/defined carry their own colour. */
  readonly origin: 'classic' | 'library' | 'nature' | 'defined';
  readonly recipe: StripRecipe;
  readonly description: string;
  readonly sources: readonly string[];
}

/** What a strip is: its recipe, origin, description and sources. Unknown ids throw. */
export function materialOf(id: StripId): MaterialInfo {
  const base = variantOf(id).base;
  const recipe = HOUSE_STRIPS[base as StripId];
  const nat = (NATURE_LIBRARY as Readonly<Record<string, MaterialDef>>)[base];
  const lib = (MATERIAL_LIBRARY as Readonly<Record<string, MaterialDef>>)[base] ?? nat;
  const def = lib ?? defined.get(base);
  if (
    !recipe ||
    stripRow(id) < 0 ||
    (customIndex(base) < 0 && !(STRIPS as readonly string[]).includes(base))
  )
    throw new Ts23dError('T3D_MATERIAL_UNKNOWN', {
      cause: `strip '${id}' is neither built in nor defined`,
      fix: `use one of ${STRIPS.join(', ')}, or defineMaterial({ id: '${id}', ... }) first`,
    });
  const classic = (CLASSIC_STRIPS as readonly string[]).includes(base);
  return {
    id,
    origin: classic ? 'classic' : nat ? 'nature' : lib ? 'library' : 'defined',
    recipe,
    description:
      def?.description ?? `classic ${recipe.kind} strip (greyscale, vertex colour tints)`,
    sources: def?.sources ?? [],
  };
}

/** Every texture set a defined material references (what `bun run textures` fetches). */
export function textureSources(): readonly TextureSource[] {
  return [...defined.values()].flatMap((d) => (d.texture ? [d.texture] : []));
}

/**
 * Credit lines for the image strips a mesh samples (`vs`: one V per vertex; pass `indices` for an
 * exact, per-triangle answer: `rowsSampled`). `materials` narrows the answer to the ids one asset
 * maps onto (`CompiledAsset.materials`): several defined materials may hold one row, and only the
 * asset's own is on its sheet. Empty when no image strip is used (the GLB stays byte-identical).
 */
export function stripCredits(
  vs: ArrayLike<number>,
  indices?: ArrayLike<number>,
  materials?: readonly string[],
): string[] {
  const rows = rowsSampled(vs, indices);
  const out: string[] = [];
  for (const [id, d] of defined)
    if (d.texture && rows.has(stripRow(id)) && (materials?.includes(id) ?? true))
      out.push(creditOf(d.texture));
  return out;
}
