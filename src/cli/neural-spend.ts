// The spend guard of `t3d neural run`: paid adapters (`paid: true`, e.g. meshyAdapter,
// kubeezAdapter) say what a job will cost (`estimate(job)`, credits) and what is left
// (`balance()`); before any of a round's jobs is sent, each estimate is printed and the run's total
// so far is checked against SPEND_LIMIT. Above it, or when a paid adapter cannot price a job (no
// estimate, or not a finite number ≥ 0), the run stops (T3D_CLI_USAGE) unless --yes-spend was
// given, so an agent never spends more than a small amount without the flag. Adapters without the
// flag are free unless they carry an estimate. Estimates only; a cache hit costs 0.

import { Ts23dError } from '../core/index.ts';
import type { NeuralAdapter, NeuralJob } from '../neural/index.ts';

/** Estimated credits one `t3d neural run` may spend without --yes-spend. */
export const SPEND_LIMIT = 50;

const priced = (n: number): boolean => Number.isFinite(n) && n >= 0;

export interface SpendGuard {
  /** Estimated credits of everything checked so far. */
  total(): number;
  /** Print and add the estimates of `jobs` (about to be sent); throws above the limit. */
  check(
    recipe: string,
    jobs: readonly { readonly job: NeuralJob; readonly adapter: NeuralAdapter }[],
  ): Promise<void>;
}

export function spendGuard(o: {
  readonly yesSpend: boolean;
  readonly log?: (line: string) => void;
}): SpendGuard {
  let total = 0;
  const asked = new Set<string>();
  return {
    total: () => total,
    async check(recipe, jobs) {
      const unpriced: string[] = [];
      for (const { job, adapter } of jobs) {
        if (adapter.paid !== true && !adapter.estimate) continue;
        if (adapter.balance && !asked.has(adapter.id)) {
          asked.add(adapter.id);
          o.log?.(`~ ${adapter.id} balance: ${(await adapter.balance()).balance} credits`);
        }
        const n = adapter.estimate ? await adapter.estimate(job) : Number.NaN;
        o.log?.(`~ ${recipe} ${job.task} on ${adapter.id}: about ${priced(n) ? n : '?'} credits`);
        if (priced(n)) total += n;
        else if (adapter.paid === true) unpriced.push(`${job.task} on ${adapter.id}`);
      }
      if (o.yesSpend) return;
      if (unpriced.length > 0)
        throw new Ts23dError('T3D_CLI_USAGE', {
          cause: `${recipe}: ${unpriced.length} job(s) on a paid adapter cannot be priced (${unpriced.join(', ')}); nothing more was sent`,
          fix: "check the requests and the model's price (t3d neural ls), then run again with --yes-spend",
        });
      if (total > SPEND_LIMIT)
        throw new Ts23dError('T3D_CLI_USAGE', {
          cause: `${recipe}: this run is estimated at ${total} credits, above ${SPEND_LIMIT}; nothing more was sent`,
          fix: 'check the requests, then run again with --yes-spend',
        });
    },
  };
}
