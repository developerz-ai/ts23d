// Tuned parameters (docs/idea/20-tuning.md): the `tune` declaration a recipe makes, its
// validation, and `ctx.tuned(name)` = compile override → committed tune.json value → default.
// Numbers only: the optimiser runs offline (`t3d tune`), builds just read what it committed.

import type { CompiledAsset } from './definition.ts';
import { Ts23dError } from './errors.ts';
import type { Lod } from './part.ts';

/** One knob the optimiser may turn, in the recipe's own units. */
export interface TuneParam {
  readonly min: number;
  readonly max: number;
  /** The hand-set value: used until `t3d tune` commits a better one. */
  readonly default: number;
  /** Snap tuned values to this grid (e.g. 0.001 m). Default (max − min) / 10 000. */
  readonly step?: number;
}

export type TuneView = '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z';

/** What the optimiser minimises: a weighted sum of these (weight default 1). */
export type TuneObjective =
  | {
      /** 1 − IoU of the outline from `view` vs a reference mask (both cropped and fitted). */
      readonly kind: 'silhouette';
      readonly view: TuneView;
      /** Inline `<svg>` markup, or a `.svg`/`.png` file beside the recipe (dark/filled = asset). */
      readonly mask: string;
      readonly lod?: Lod;
      readonly weight?: number;
    }
  | {
      /** Mean relative error of `real.measures` at LOD0 (a missing part counts 1). */
      readonly kind: 'measures';
      readonly weight?: number;
    }
  | {
      /** Art metrics: (1 − worst LOD2 silhouette IoU) + rest-share shortfall + (1 − focal share). */
      readonly kind: 'art';
      readonly weight?: number;
    }
  | {
      /** Triangles at `lod` ÷ `target` (default the budget for that LOD). Weight it small. */
      readonly kind: 'budget';
      readonly lod?: Lod;
      readonly target?: number;
      readonly weight?: number;
    }
  | {
      readonly kind: 'custom';
      readonly name: string;
      /** Lower is better; receives LOD0. */
      readonly score: (asset: CompiledAsset) => number;
      readonly weight?: number;
    };

export interface TuneSpec {
  readonly params: Readonly<Record<string, TuneParam>>;
  readonly objectives: readonly TuneObjective[];
  /** The committed tune.json, imported by the recipe (`import saved from './tune.json'`). */
  readonly saved?: unknown;
}

export type TunedValues = Readonly<Record<string, number>>;

function invalid(cause: string, fix: string): never {
  throw new Ts23dError('T3D_TUNE_INVALID', { cause, fix });
}

/** Throws T3D_TUNE_INVALID on an impossible declaration (bad range, default outside it…). */
export function checkTune(asset: string, spec: TuneSpec): void {
  const names = Object.keys(spec.params);
  if (names.length === 0)
    invalid(
      `'${asset}' declares tune with no params`,
      'add params: { jawWidth: { min, max, default } }',
    );
  for (const name of names) {
    const p = spec.params[name];
    if (!p) continue;
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name))
      invalid(
        `'${asset}' tune param '${name}' is not an identifier`,
        'name it like a variable: jawWidth',
      );
    if (![p.min, p.max, p.default].every(Number.isFinite) || !(p.min < p.max))
      invalid(
        `'${asset}' tune param '${name}' has range [${p.min}, ${p.max}]`,
        'use finite numbers with min < max (the optimiser searches between them)',
      );
    if (p.default < p.min || p.default > p.max)
      invalid(
        `'${asset}' tune param '${name}' default ${p.default} is outside [${p.min}, ${p.max}]`,
        'put the default inside the range, or widen the range to include it',
      );
    if (p.step !== undefined && !(p.step > 0 && p.step <= p.max - p.min))
      invalid(
        `'${asset}' tune param '${name}' step ${p.step} is not in (0, ${p.max - p.min}]`,
        'use a positive step no larger than the range, or omit it',
      );
  }
  if (spec.objectives.length === 0)
    invalid(
      `'${asset}' declares tune with no objectives`,
      "add one: objectives: [{ kind: 'silhouette', view: '+X', mask: 'front.svg' }]",
    );
  for (const o of spec.objectives)
    if (o.weight !== undefined && !(o.weight >= 0 && Number.isFinite(o.weight)))
      invalid(`'${asset}' ${o.kind} objective weight ${o.weight}`, 'use a finite weight ≥ 0');
}

/** Own-property lookup: `constructor`, `toString`… on the prototype are never a param or value. */
const own = <T>(rec: Readonly<Record<string, T>> | undefined, key: string): T | undefined =>
  rec !== undefined && Object.hasOwn(rec, key) ? rec[key] : undefined;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function checkValues(asset: string, spec: TuneSpec, values: TunedValues, from: string): void {
  for (const [name, v] of Object.entries(values)) {
    const p = own(spec.params, name);
    if (!p)
      invalid(
        `${from} sets '${name}', which '${asset}' does not declare in tune.params`,
        're-run `t3d tune` (stale tune.json) or declare the param',
      );
    if (!Number.isFinite(v) || v < p.min || v > p.max)
      invalid(
        `${from} sets '${name}' = ${v}, outside [${p.min}, ${p.max}]`,
        're-run `t3d tune`, or widen the range if the value is intended',
      );
  }
}

/** The committed values for `asset` from the imported tune.json ({} when it has none yet). */
export function savedValues(asset: string, spec: TuneSpec): TunedValues {
  const file = spec.saved;
  if (file === undefined) return {};
  const entry = isRecord(file) ? file[asset] : undefined;
  if (entry === undefined && isRecord(file)) return {};
  const values = isRecord(entry) ? entry['values'] : undefined;
  if (!isRecord(values) || !Object.values(values).every((v) => typeof v === 'number'))
    invalid(
      `tune.json entry for '${asset}' is not { values: { name: number } }`,
      'let `t3d tune` write the file; do not edit it by hand',
    );
  const out = values as Record<string, number>;
  checkValues(asset, spec, out, `tune.json for '${asset}'`);
  return out;
}

/** `ctx.tuned`: override (the optimiser) → saved (tune.json) → declared default. */
export function tunedReader(
  asset: string,
  spec: TuneSpec | undefined,
  override: TunedValues | undefined,
): (name: string) => number {
  if (!spec) {
    if (override && Object.keys(override).length)
      invalid(`compile({ tuned }) for '${asset}', which declares no tune`, 'declare tune.params');
    return (name) =>
      invalid(
        `ctx.tuned('${name}') in '${asset}', which declares no tune`,
        `add tune: { params: { ${name}: { min, max, default } }, objectives: […] }`,
      );
  }
  if (override) checkValues(asset, spec, override, 'compile({ tuned })');
  const saved = savedValues(asset, spec);
  return (name) => {
    const p = own(spec.params, name);
    if (!p)
      invalid(
        `ctx.tuned('${name}') but '${asset}' declares no such tune param`,
        `declare it: tune.params.${name} = { min, max, default }`,
      );
    return own(override, name) ?? own(saved, name) ?? p.default;
  };
}
