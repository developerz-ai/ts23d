// Variations without new atlas rows. `materialVariant(id, n)` returns `id~n`: the same strip read
// from a different place along U (a golden-ratio shift), so ten crates or rocks stop showing the
// same boards or cracks; it costs nothing on the sheet. `weathered(id, { id, wet, wear, age })`
// derives a new MaterialDef from any strip with weathering dials for `defineMaterial` (that one
// takes a custom row: it paints differently).

import { Ts23dError } from '../core/index.ts';
import type { MaterialDef } from './material-def.ts';
import { HOUSE_STRIPS } from './paint/default-sheet.ts';
import type { StripRecipe } from './paint/types.ts';
import { type StripId, spanOf, stripRow, VARIANTS, variantOf } from './trim-sheet.ts';

/** The `n`-th U-shifted look of a strip (0 = the strip itself, up to VARIANTS − 1). */
export function materialVariant(id: StripId, n: number): StripId {
  const { base } = variantOf(id);
  if (!(Number.isInteger(n) && n >= 0 && n < VARIANTS))
    throw new Ts23dError('T3D_MATERIAL_INVALID', {
      cause: `materialVariant('${id}', ${n}): variant index out of range`,
      fix: `use an integer 0..${VARIANTS - 1} (e.g. rng.int(0, ${VARIANTS - 1}) per instance)`,
    });
  const recipe = (HOUSE_STRIPS as Record<string, StripRecipe | undefined>)[base];
  if (stripRow(base) < 0 || !recipe)
    throw new Ts23dError('T3D_MATERIAL_UNKNOWN', {
      cause: `materialVariant('${id}'): strip '${base}' is neither built in nor defined`,
      fix: `defineMaterial({ id: '${base}', ... }) before taking variants of it`,
    });
  if (n === 0) return base as StripId;
  const vid = `${base}~${n}`;
  // Alias the recipe so every lookup by id (V metres, materialOf) sees the base material.
  (HOUSE_STRIPS as Record<string, StripRecipe>)[vid] = recipe;
  return vid as StripId;
}

export interface WeatherOptions {
  /** The new material's id (snake_case). */
  readonly id: string;
  readonly wet?: number;
  readonly wear?: number;
  readonly age?: number;
  readonly description?: string;
}

/** A MaterialDef for `defineMaterial`: strip `from` (any built-in or defined) plus weathering. */
export function weathered(from: StripId, o: WeatherOptions): MaterialDef {
  const { base } = variantOf(from);
  const r = (HOUSE_STRIPS as Record<string, StripRecipe | undefined>)[base];
  if (!r)
    throw new Ts23dError('T3D_MATERIAL_UNKNOWN', {
      cause: `weathered('${from}'): no such strip`,
      fix: 'start from a built-in strip id or one returned by defineMaterial',
    });
  const params = { ...r.params };
  for (const k of ['wet', 'wear', 'age'] as const) delete params[k];
  return {
    id: o.id,
    kind: r.kind,
    scaleMetres: r.scaleMetres,
    spanMetres: spanOf(base),
    roughness: r.roughness,
    ...(r.metalness !== undefined ? { metalness: r.metalness } : {}),
    ...(r.albedo ? { albedo: r.albedo } : {}),
    ...(r.albedo2 ? { albedo2: r.albedo2 } : {}),
    ...(Object.keys(params).length ? { params } : {}),
    ...(r.paint ? { paint: r.paint } : {}),
    ...(r.graph ? { graph: r.graph } : {}),
    ...(r.texture ? { texture: r.texture } : {}),
    wet: o.wet ?? r.params?.['wet'] ?? 0,
    wear: o.wear ?? r.params?.['wear'] ?? 0,
    age: o.age ?? r.params?.['age'] ?? 0,
    description:
      o.description ??
      `${base}, weathered (wet ${o.wet ?? 0}, wear ${o.wear ?? 0}, age ${o.age ?? 0})`,
  };
}
