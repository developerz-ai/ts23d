// The spend guard of `t3d neural run`: adapters of paid services say what a job will cost
// (`estimate(job)`, e.g. meshyAdapter: credits) and what is left (`balance()`); before any of a
// round's jobs is sent, each estimate is printed and the run's total so far is checked against
// SPEND_LIMIT. Above it the run stops (T3D_CLI_USAGE) unless --yes-spend was given, so an agent
// never spends more than a small amount without the flag. Estimates only; a cache hit costs 0.

import { Ts23dError } from '../core/index.ts';
import type { NeuralAdapter, NeuralJob } from '../neural/index.ts';

/** Estimated credits one `t3d neural run` may spend without --yes-spend. */
export const SPEND_LIMIT = 50;

interface Priced {
  estimate(job: NeuralJob): number;
  balance?(): Promise<{ readonly balance: number }>;
}

const priced = (a: NeuralAdapter): (NeuralAdapter & Priced) | undefined =>
  typeof (a as Partial<Priced>).estimate === 'function' ? (a as NeuralAdapter & Priced) : undefined;

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
      for (const { job, adapter } of jobs) {
        const p = priced(adapter);
        if (!p) continue;
        if (p.balance && !asked.has(adapter.id)) {
          asked.add(adapter.id);
          o.log?.(`~ ${adapter.id} balance: ${(await p.balance()).balance} credits`);
        }
        const n = p.estimate(job);
        o.log?.(
          `~ ${recipe} ${job.task} on ${adapter.id}: about ${Number.isFinite(n) ? n : '?'} credits`,
        );
        if (Number.isFinite(n)) total += n;
      }
      if (total > SPEND_LIMIT && !o.yesSpend)
        throw new Ts23dError('T3D_CLI_USAGE', {
          cause: `${recipe}: this run is estimated at ${total} credits, above ${SPEND_LIMIT}; nothing more was sent`,
          fix: 'check the requests, then run again with --yes-spend',
        });
    },
  };
}
