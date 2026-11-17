// Meshy credits: what is left (`meshyBalance`, GET v1/balance, free) and what one job will cost
// (`meshyEstimate`), from the pricing table in docs/research/meshy.md §2: mesh 20 (7.1 / 6) or 5
// (6-lite, t2.x) + 5 ultra geometry + 10 texture (15 at 8K) + a second texture pass for a foreign
// texture model; rigging 5 + 3 per clip; retexture 10 (15 at 8K). An estimate only: the task's
// `consumed_credits` (recorded in record.json's `server` line) is the truth, and prices change.

import type { NeuralJob } from './adapter.ts';
import { fieldsOf } from './adapter.ts';
import { type MeshyOptions, meshOptions, meshyCost } from './meshy-params.ts';
import { retextureCost } from './meshy-post.ts';
import type { MeshyTasks } from './meshy-task.ts';
import { failed } from './wire.ts';

export interface MeshyBalance {
  /** Credits that can be spent now. */
  readonly balance: number;
  readonly monthly?: number;
  readonly permanent?: number;
}

/** Credits left on the account behind the key (0 credits to ask). */
export async function meshyBalance(t: Pick<MeshyTasks, 'get'>): Promise<MeshyBalance> {
  const got = (await t.get('v1/balance', 'read balance')) as Record<string, unknown> | null;
  const balance = got?.['balance'];
  if (typeof balance !== 'number' || !Number.isFinite(balance))
    failed('the Meshy balance reply has no numeric `balance`', 'check baseUrl and the API key');
  const more = (k: string, as: string) =>
    typeof got?.[k] === 'number' ? { [as]: got[k] as number } : {};
  return {
    balance: balance as number,
    ...more('monthly_credits', 'monthly'),
    ...more('permanent_credits', 'permanent'),
  };
}

/** Credits `job` is expected to cost on Meshy; NaN for a model Meshy does not have. */
export function meshyEstimate(
  o: MeshyOptions,
  job: Pick<NeuralJob, 'task' | 'request' | 'model'>,
): number {
  const r = fieldsOf(job.request);
  if (job.task === 'rig') return 5 + 3 * (Array.isArray(r['clips']) ? r['clips'].length : 0);
  if (job.task === 'texture') return retextureCost(r['size']);
  if (job.task === 'mesh') return meshyCost(meshOptions(o, r), job.model ?? o.model ?? 'latest');
  return Number.NaN;
}
