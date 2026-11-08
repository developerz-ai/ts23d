// The search space: a recipe's tune params ↔ the optimiser's unit box. Values snap to each param's
// step (default range / 10 000) and print without float noise, so tune.json is stable text and
// the evaluation cache hits on equal values.

import type { TunedValues, TuneSpec } from './types.ts';

export interface Space {
  /** Param names in declaration order (the unit-box axes). */
  readonly names: readonly string[];
  readonly defaults: TunedValues;
  toUnit(values: TunedValues): number[];
  fromUnit(x: readonly number[]): TunedValues;
  /** Cache key: the snapped values in order. */
  key(values: TunedValues): string;
}

export function spaceOf(spec: TuneSpec): Space {
  const params = Object.entries(spec.params).map(([name, p]) => ({
    name,
    ...p,
    step: p.step ?? (p.max - p.min) / 10000,
  }));
  const names = params.map((p) => p.name);
  const snap = (i: number, v: number): number => {
    const p = params[i];
    if (!p) return v;
    const k = Math.round((Math.min(p.max, Math.max(p.min, v)) - p.min) / p.step);
    return Number(Math.min(p.max, p.min + k * p.step).toPrecision(10));
  };
  const record = (vs: readonly number[]): TunedValues =>
    Object.fromEntries(names.map((n, i) => [n, vs[i] ?? 0]));
  return {
    names,
    defaults: record(params.map((p) => p.default)),
    toUnit: (values) =>
      params.map((p) => ((values[p.name] ?? p.default) - p.min) / (p.max - p.min)),
    fromUnit: (x) => record(params.map((p, i) => snap(i, p.min + (x[i] ?? 0) * (p.max - p.min)))),
    key: (values) => names.map((n) => values[n]).join(','),
  };
}
