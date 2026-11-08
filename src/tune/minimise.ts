// Shared shapes of the black-box minimisers (CMA-ES, coordinate search): a function on the unit
// box [0, 1]^n, a start point, an evaluation budget, a seed — and what they hand back.

export type Objective = (x: readonly number[]) => number;

export interface MinimiseOptions {
  /** Start point in [0, 1]^n (the recipe's defaults, normalised). */
  readonly x0: readonly number[];
  /** Hard cap on objective calls, including the start point. */
  readonly evals: number;
  readonly seed: number;
  /** Initial step size in unit-box units. Default 0.25. */
  readonly sigma?: number;
  /** Stop once the search radius is below this (unit box). Default 1e-4. */
  readonly tolX?: number;
  /** Stop when the best value improved by < 1e-9 over this many generations. Default 12 + 30n/λ. */
  readonly patience?: number;
  /** Stop as soon as a value ≤ target is found. */
  readonly target?: number;
}

/** One row of the convergence table. */
export interface Step {
  readonly gen: number;
  /** Objective calls so far. */
  readonly evals: number;
  /** Best value found so far. */
  readonly best: number;
  /** Best value in this generation (sweep). */
  readonly current: number;
  /** Search radius (unit box). */
  readonly sigma: number;
}

export type StopReason = 'evals' | 'tolx' | 'stall' | 'target';

export interface Minimum {
  /** Best point, inside [0, 1]^n. */
  readonly x: number[];
  readonly f: number;
  readonly evals: number;
  readonly history: Step[];
  readonly stop: StopReason;
}

export const clamp01 = (x: readonly number[]): number[] =>
  x.map((v) => Math.min(1, Math.max(0, v)));

/** Counts calls and remembers the best clamped point; refuses calls past the budget. */
export class Tracker {
  evals = 0;
  best = Number.POSITIVE_INFINITY;
  bestX: number[];
  constructor(
    private readonly f: Objective,
    x0: readonly number[],
  ) {
    this.bestX = clamp01(x0);
  }
  /** f at the clamped point (+ a quadratic pull back inside when x left the box). */
  eval(x: readonly number[]): number {
    const c = clamp01(x);
    const v = this.f(c);
    this.evals++;
    if (v < this.best) {
      this.best = v;
      this.bestX = c;
    }
    let out = 0;
    for (let i = 0; i < x.length; i++) out += ((x[i] ?? 0) - (c[i] ?? 0)) ** 2;
    return v + 10 * out;
  }
}
