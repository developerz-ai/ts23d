// Project materials: `defineMaterial` validates a MaterialDef, gives it one of the sheet's custom
// strip rows (picked from its id, not from registration order: slots.ts) and adds it to the house
// sheet, so `DEFAULT_SHEET` paints it and primitives map onto it. Redefining an id with the same definition is a no-op; a different one is a conflict.
// `materialOf` answers what any strip is (built-in or defined) for docs, review and tests;
// `textureSources` / `stripCredits` serve the CC0 image strips (fetch list, GLB credits).

import { Ts23dError } from '../core/index.ts';
import { MATERIAL_LIBRARY } from './library.ts';
import { type MaterialDef, toStripRecipe } from './material-def.ts';
import { NATURE_LIBRARY } from './nature.ts';
import { HOUSE_STRIPS } from './paint/default-sheet.ts';
import type { StripRecipe } from './paint/types.ts';
import { clearCustom, customIds, customIndex, pushCustom } from './slots.ts';
import { creditOf, type TextureSource } from './texture-source.ts';
import {
  CLASSIC_STRIPS,
  CUSTOM_STRIP_SLOTS,
  type CustomStripId,
  STRIPS,
  type StripId,
  stripRect,
  stripRow,
  variantOf,
} from './trim-sheet.ts';

const defined = new Map<string, MaterialDef>();

/** The same definition, field by field (painters by identity, colours and params by value). */
function same(a: MaterialDef, b: MaterialDef): boolean {
  return (
    JSON.stringify({ ...a, paint: 0, graph: 0 }) === JSON.stringify({ ...b, paint: 0, graph: 0 }) &&
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
  if (customIds().length >= CUSTOM_STRIP_SLOTS)
    throw new Ts23dError('T3D_SHEET_FULL', {
      cause: `the trim sheet has ${CUSTOM_STRIP_SLOTS} custom strip rows, all taken (${customIds().join(', ')})`,
      fix: 'reuse a built-in strip with a vertex colour, or restyle an unused built-in strip in your SheetRecipe',
    });
  defined.set(id, def);
  pushCustom(id, def.spanMetres ?? 4, CUSTOM_STRIP_SLOTS);
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
 * Credit lines for the image strips a mesh samples: any V coordinate inside such a strip's row
 * counts. Empty when no image strip is used (the GLB stays byte-identical).
 */
export function stripCredits(vs: ArrayLike<number>): string[] {
  const out: string[] = [];
  for (const [id, d] of defined) {
    if (!d.texture) continue;
    const r = stripRect(id as StripId);
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i] ?? -1;
      if (v >= r.v0 && v <= r.v1) {
        out.push(creditOf(d.texture));
        break;
      }
    }
  }
  return out;
}
