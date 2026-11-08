// Deterministic CMA-ES (Hansen's (μ/μ_w, λ) with rank-one + rank-μ updates and cumulative step
// size) on the unit box. Normal samples come from the core mulberry32 RNG (Box–Muller), ties sort
// by index, so the same seed walks the same path. Bounds: evaluate the clamped point, pull back
// with a quadratic penalty. Stops on the evaluation budget, a collapsed radius, a stall or a target.

import { createRng } from '../core/index.ts';
import { symmetricEigen } from './eigen.ts';
import {
  type MinimiseOptions,
  type Minimum,
  type Objective,
  type Step,
  Tracker,
} from './minimise.ts';

const dot = (a: readonly number[], b: readonly number[]): number =>
  a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0);

export function cmaes(f: Objective, o: MinimiseOptions): Minimum {
  const n = o.x0.length;
  const rng = createRng(o.seed);
  const gauss = (): number => {
    const u = Math.max(rng.next(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
  };
  const lambda = 4 + Math.floor(3 * Math.log(n));
  const mu = Math.floor(lambda / 2);
  const raw = Array.from({ length: mu }, (_, i) => Math.log(mu + 0.5) - Math.log(i + 1));
  const wsum = raw.reduce((s, v) => s + v, 0);
  const w = raw.map((v) => v / wsum);
  const mueff = 1 / w.reduce((s, v) => s + v * v, 0);
  const cs = (mueff + 2) / (n + mueff + 5);
  const ds = 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (n + 1)) - 1) + cs;
  const cc = (4 + mueff / n) / (n + 4 + (2 * mueff) / n);
  const c1 = 2 / ((n + 1.3) ** 2 + mueff);
  const cmu = Math.min(1 - c1, (2 * (mueff - 2 + 1 / mueff)) / ((n + 2) ** 2 + mueff));
  const chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
  const tolX = o.tolX ?? 1e-4;
  const patience = o.patience ?? 12 + Math.ceil((30 * n) / lambda);

  let m = [...o.x0];
  let sigma = o.sigma ?? 0.25;
  let C: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
  let ps = new Array<number>(n).fill(0);
  let pc = new Array<number>(n).fill(0);
  const t = new Tracker(f, o.x0);
  t.eval(o.x0);
  const history: Step[] = [{ gen: 0, evals: 1, best: t.best, current: t.best, sigma }];
  const bests: number[] = [t.best];
  let stop: Minimum['stop'] = 'evals';
  for (let gen = 1; t.evals + lambda <= o.evals; gen++) {
    if (o.target !== undefined && t.best <= o.target) {
      stop = 'target';
      break;
    }
    const { values, vectors: B } = symmetricEigen(C);
    const D = values.map(Math.sqrt);
    const col = (k: number): number[] => B.map((row) => row[k] ?? 0);
    const pop = Array.from({ length: lambda }, (_, k) => {
      const z = Array.from({ length: n }, gauss);
      const y = new Array<number>(n).fill(0);
      for (let j = 0; j < n; j++) {
        const s = (D[j] ?? 0) * (z[j] ?? 0);
        for (let i = 0; i < n; i++) y[i] = (y[i] ?? 0) + (B[i]?.[j] ?? 0) * s;
      }
      const x = m.map((v, i) => v + sigma * (y[i] ?? 0));
      return { k, y, f: t.eval(x) };
    });
    pop.sort((a, b) => a.f - b.f || a.k - b.k);
    const yw = new Array<number>(n).fill(0);
    for (let r = 0; r < mu; r++) {
      const p = pop[r];
      if (p) for (let i = 0; i < n; i++) yw[i] = (yw[i] ?? 0) + (w[r] ?? 0) * (p.y[i] ?? 0);
    }
    m = m.map((v, i) => v + sigma * (yw[i] ?? 0));
    // C^-1/2 · yw = B · D^-1 · Bᵀ · yw
    const inv = new Array<number>(n).fill(0);
    for (let k = 0; k < n; k++) {
      const ck = col(k);
      const s = dot(ck, yw) / Math.max(D[k] ?? 0, 1e-12);
      for (let i = 0; i < n; i++) inv[i] = (inv[i] ?? 0) + (ck[i] ?? 0) * s;
    }
    const kps = Math.sqrt(cs * (2 - cs) * mueff);
    ps = ps.map((v, i) => (1 - cs) * v + kps * (inv[i] ?? 0));
    const psn = Math.sqrt(dot(ps, ps));
    const hs = psn / Math.sqrt(1 - (1 - cs) ** (2 * gen)) < (1.4 + 2 / (n + 1)) * chiN ? 1 : 0;
    const kpc = hs * Math.sqrt(cc * (2 - cc) * mueff);
    pc = pc.map((v, i) => (1 - cc) * v + kpc * (yw[i] ?? 0));
    const keep = 1 - c1 - cmu + (1 - hs) * c1 * cc * (2 - cc);
    C = C.map((row, i) =>
      row.map((v, j) => {
        let rmu = 0;
        for (let r = 0; r < mu; r++) {
          const y = pop[r]?.y;
          if (y) rmu += (w[r] ?? 0) * (y[i] ?? 0) * (y[j] ?? 0);
        }
        return keep * v + c1 * (pc[i] ?? 0) * (pc[j] ?? 0) + cmu * rmu;
      }),
    );
    sigma *= Math.exp((cs / ds) * (psn / chiN - 1));
    sigma = Math.min(sigma, 1);
    history.push({ gen, evals: t.evals, best: t.best, current: pop[0]?.f ?? t.best, sigma });
    bests.push(t.best);
    if (sigma * Math.sqrt(Math.max(...values, 1e-30)) < tolX) {
      stop = 'tolx';
      break;
    }
    const old = bests[bests.length - 1 - patience];
    if (old !== undefined && old - t.best < 1e-9) {
      stop = 'stall';
      break;
    }
  }
  if (o.target !== undefined && t.best <= o.target) stop = 'target';
  return { x: t.bestX, f: t.best, evals: t.evals, history, stop };
}
