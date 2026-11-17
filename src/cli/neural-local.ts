// Local outputs in a `t3d neural run` chain (ADR 014, "Local outputs"): a request whose input is a
// local output that is not on this machine has no bytes to send. `absentInputs` finds those
// inputs (the request names them by sha256), `absentInputNotice` says what to do instead of a
// generic miss: the upstream output must be made, or copied, here first.

import type { NeuralJob } from '../neural/index.ts';

/** The absent local outputs (sha256 → upstream key) `job`'s request names and has no bytes for. */
export function absentInputs(
  job: NeuralJob,
  absent: ReadonlyMap<string, string>,
): readonly string[] {
  if (absent.size === 0) return [];
  const request = JSON.stringify(job.request);
  return [...absent.keys()]
    .filter((sha) => request.includes(sha) && !job.inputs?.get(sha)?.length)
    .sort();
}

export function absentInputNotice(o: {
  readonly recipe: string;
  readonly file: string;
  readonly dir: string;
  readonly job: NeuralJob;
  readonly shas: readonly string[];
  readonly absent: ReadonlyMap<string, string>;
}): { readonly message: string; readonly fix: string } {
  const sha = o.shas[0] ?? '';
  const key = o.absent.get(sha) ?? '';
  return {
    message: `${o.recipe}: ${o.job.task} request not sent: input ${sha.slice(0, 12)}… is a local output not on this machine`,
    fix: `re-run the upstream request here (delete ${o.dir}/${key} and run \`t3d neural run ${o.file}\` with its adapter; its hash, and so this request, will change), or copy that directory's local-* file from the machine that made it`,
  };
}
