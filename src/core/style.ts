// Style bible as code: what makes a set of assets look like one game (palette roles, texel
// density, bevel sizes, wear, value key). `defineStyle` validates it; QA set coherence measures
// each asset against it and flags robust-z outliers (T3D_STYLE_OUTLIER, plan 101 slice 16).

import { Ts23dError } from './errors.ts';

export interface StyleDefinition {
  readonly name: string;
  /** Palette by role: `{ primary: '#84402d', metal: '#5a5f63' }`. Asset colours must sit near one. */
  readonly palette: Readonly<Record<string, string>>;
  /** Max CIEDE2000 distance from the nearest palette colour; default 12. */
  readonly paletteDeltaE?: number;
  /** Target texel density, pixels per metre on the trim sheet. */
  readonly texelDensity?: number;
  /** Bevel radii the set uses, metres [min, max]. */
  readonly bevel?: readonly [number, number];
  /** Weathered surface share 0..1 [min, max]. */
  readonly wear?: readonly [number, number];
  /** Greyscale value key of the beauty render: mean and spread, 0..1. */
  readonly valueKey?: { readonly mean: number; readonly spread: number };
  /** Robust z (median / MAD) above which a metric is an outlier; default 3.5. */
  readonly outlierZ?: number;
}

export interface Style extends StyleDefinition {
  readonly paletteDeltaE: number;
  readonly outlierZ: number;
  readonly __ts23d: 'style';
}

const HEX = /^#[0-9a-f]{6}$/i;
const unit = (v: number): boolean => Number.isFinite(v) && v >= 0 && v <= 1;
const positive = (v: number): boolean => Number.isFinite(v) && v > 0;
const range = (r: readonly [number, number], ok: (v: number) => boolean): boolean =>
  ok(r[0]) && ok(r[1]) && r[0] <= r[1];

export function defineStyle(def: StyleDefinition): Style {
  const bad = (cause: string, fix: string): never => {
    throw new Ts23dError('T3D_RECIPE_INVALID', { cause: `style '${def.name}': ${cause}`, fix });
  };
  if (!/^[a-z][a-z0-9_]*$/.test(def.name)) bad('name is not snake_case', 'rename it, e.g. rts');
  const roles = Object.entries(def.palette);
  if (roles.length === 0) bad('palette is empty', "name a colour per role: { primary: '#84402d' }");
  for (const [role, hex] of roles)
    if (!HEX.test(hex)) bad(`palette '${role}' is '${hex}'`, "use '#rrggbb'");
  if (def.paletteDeltaE !== undefined && !positive(def.paletteDeltaE))
    bad(`paletteDeltaE ${def.paletteDeltaE} is not > 0`, 'use e.g. 12');
  if (def.texelDensity !== undefined && !positive(def.texelDensity))
    bad(`texelDensity ${def.texelDensity} is not > 0`, 'give pixels per metre, e.g. 512');
  if (def.bevel && !range(def.bevel, positive))
    bad(`bevel ${def.bevel.join('..')} is not a positive [min, max]`, 'e.g. bevel: [0.002, 0.02]');
  if (def.wear && !range(def.wear, unit))
    bad(`wear ${def.wear.join('..')} is not [min, max] in 0..1`, 'e.g. wear: [0.05, 0.3]');
  if (def.valueKey && !(unit(def.valueKey.mean) && unit(def.valueKey.spread)))
    bad('valueKey mean/spread are not in 0..1', 'e.g. valueKey: { mean: 0.45, spread: 0.2 }');
  if (def.outlierZ !== undefined && !positive(def.outlierZ))
    bad(`outlierZ ${def.outlierZ} is not > 0`, 'use e.g. 3.5');
  return {
    ...def,
    paletteDeltaE: def.paletteDeltaE ?? 12,
    outlierZ: def.outlierZ ?? 3.5,
    __ts23d: 'style',
  };
}
