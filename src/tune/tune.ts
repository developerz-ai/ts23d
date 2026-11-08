// Offline tuning of one asset: map its `tune.params` to the unit box, minimise the weighted
// objectives with CMA-ES (or coordinate search) from the declared defaults, cache trials by their
// snapped values, and return before/after values and scores plus the convergence history.
// Deterministic: same recipe + seed + budget → the same result, so tune.json is reproducible.

import { type Asset, Ts23dError } from '../core/index.ts';
import { cmaes } from './cmaes.ts';
import { coordinateSearch } from './coordinate.ts';
import type { Step, StopReason } from './minimise.ts';
import { type FittedMasks, type Score, scoreValues } from './objectives.ts';
import { spaceOf } from './space.ts';
import type { TunedValues } from './types.ts';

export type TuneMethod = 'cmaes' | 'coordinate';

export interface TuneOptions {
  /** Objective calls (each compiles + scores once unless cached). Default 120. */
  readonly evals?: number;
  /** Optimiser seed (not the recipe seed). Default 1. */
  readonly seed?: number;
  readonly method?: TuneMethod;
  /** Fitted reference masks from loadMasks (required for silhouette objectives). */
  readonly masks?: FittedMasks;
  /** Initial search radius in unit-box units. Default 0.3. */
  readonly sigma?: number;
  /** Stop once the weighted objective is at or below this. */
  readonly target?: number;
}

export interface TuneState {
  readonly values: TunedValues;
  readonly score: Score;
}

export interface TuneResult {
  readonly asset: string;
  readonly method: TuneMethod;
  readonly seed: number;
  /** Objective calls made; `compiled` of them were not cache hits. */
  readonly evals: number;
  readonly compiled: number;
  readonly stop: StopReason;
  readonly before: TuneState;
  readonly after: TuneState;
  readonly history: readonly Step[];
}

export function tune(asset: Asset, o: TuneOptions = {}): TuneResult {
  const spec = asset.tune;
  if (!spec)
    throw new Ts23dError('T3D_TUNE_INVALID', {
      cause: `'${asset.name}' declares no tune`,
      fix: "add tune: { params: { … }, objectives: [ … ] } and read params with ctx.tuned('name')",
    });
  const evals = o.evals ?? 120;
  if (!(Number.isInteger(evals) && evals >= 1))
    throw new Ts23dError('T3D_TUNE_INVALID', {
      cause: `evaluation budget ${evals}`,
      fix: 'pass a whole number ≥ 1, e.g. --evals 120',
    });
  const seed = o.seed ?? 1;
  const method = o.method ?? 'cmaes';
  const masks = o.masks ?? new Map();
  const space = spaceOf(spec);
  const cache = new Map<string, Score>();
  const scoreOf = (values: TunedValues): Score => {
    const key = space.key(values);
    const hit = cache.get(key);
    if (hit) return hit;
    const s = scoreValues(asset, values, masks);
    cache.set(key, s);
    return s;
  };
  const before: TuneState = { values: space.defaults, score: scoreOf(space.defaults) };
  const minimise = method === 'cmaes' ? cmaes : coordinateSearch;
  const r = minimise((x) => scoreOf(space.fromUnit(x)).total, {
    x0: space.toUnit(space.defaults),
    evals,
    seed,
    sigma: o.sigma ?? 0.3,
    ...(o.target !== undefined ? { target: o.target } : {}),
  });
  const best = space.fromUnit(r.x);
  const after: TuneState =
    scoreOf(best).total <= before.score.total ? { values: best, score: scoreOf(best) } : before;
  return {
    asset: asset.name,
    method,
    seed,
    evals: r.evals,
    compiled: cache.size,
    stop: r.stop,
    before,
    after,
    history: r.history,
  };
}
