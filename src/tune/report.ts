// Tuning results as text: the committed tune.json (sorted keys, rounded numbers, no timestamps —
// same run, same bytes), the convergence table the CLI prints, and tune-report.md.

import type { Step } from './minimise.ts';
import type { TuneResult } from './tune.ts';

const r6 = (v: number): number => Number(v.toFixed(6));

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The tune.json entry for one asset. */
export function tuneEntry(r: TuneResult): Record<string, unknown> {
  return {
    values: r.after.values,
    method: r.method,
    seed: r.seed,
    evals: r.evals,
    objective: { before: r6(r.before.score.total), after: r6(r.after.score.total) },
  };
}

/** Merge results into an existing tune.json (other assets kept), keys sorted. */
export function tuneJson(existing: unknown, results: readonly TuneResult[]): string {
  const merged: Record<string, unknown> = isRecord(existing) ? { ...existing } : {};
  for (const r of results) merged[r.asset] = tuneEntry(r);
  const sorted = Object.fromEntries(
    Object.keys(merged)
      .sort()
      .map((k) => [k, merged[k]]),
  );
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

/** At most `max` rows: the first, the last, and evenly spaced ones between. */
function sample(history: readonly Step[], max: number): Step[] {
  if (history.length <= max) return [...history];
  const out: Step[] = [];
  for (let i = 0; i < max; i++) {
    const s = history[Math.round((i * (history.length - 1)) / (max - 1))];
    if (s && out.at(-1) !== s) out.push(s);
  }
  return out;
}

export function convergenceTable(r: TuneResult, max = 16): string {
  const rows = sample(r.history, max).map(
    (s) =>
      `| ${s.gen} | ${s.evals} | ${s.current.toFixed(4)} | ${s.best.toFixed(4)} | ${s.sigma.toFixed(4)} |`,
  );
  return [
    '| gen | evals | gen best | best so far | σ |',
    '|---:|---:|---:|---:|---:|',
    ...rows,
  ].join('\n');
}

const fmt = (v: number | undefined): string => (v === undefined ? '—' : String(r6(v)));

export function reportMd(r: TuneResult, strip?: string): string {
  const names = Object.keys(r.before.values);
  const params = names.map(
    (n) => `| \`${n}\` | ${fmt(r.before.values[n])} | ${fmt(r.after.values[n])} |`,
  );
  const objectives = r.before.score.objectives.map((o, i) => {
    const a = r.after.score.objectives[i];
    const iou = o.name.startsWith('silhouette')
      ? ` (IoU ${(1 - o.value).toFixed(3)} → ${(1 - (a?.value ?? o.value)).toFixed(3)})`
      : '';
    return `| ${o.name} | ${o.weight} | ${o.value.toFixed(4)} | ${(a?.value ?? o.value).toFixed(4)}${iou} |`;
  });
  return [
    `# Tuning report: ${r.asset}`,
    '',
    `Method ${r.method}, seed ${r.seed}, ${r.evals} evaluations (${r.compiled} compiled, the rest cached), stop: ${r.stop}.`,
    `Weighted objective ${r.before.score.total.toFixed(4)} → ${r.after.score.total.toFixed(4)}.`,
    'Re-run `t3d tune` with the same seed and budget to reproduce tune.json byte for byte.',
    '',
    '## Params',
    '',
    '| param | default | tuned |',
    '|---|---:|---:|',
    ...params,
    '',
    '## Objectives (lower is better)',
    '',
    '| objective | weight | before | after |',
    '|---|---:|---:|---:|',
    ...objectives,
    '',
    '## Convergence',
    '',
    convergenceTable(r),
    ...(strip
      ? [
          '',
          '## Before / after',
          '',
          `![before and after](${strip})`,
          '',
          'Top row before (defaults), bottom row after (tuned). Per silhouette objective: grey = both,',
          'orange = model only (too much), blue = reference only (missing). Last column: beauty render.',
        ]
      : []),
    '',
  ].join('\n');
}
