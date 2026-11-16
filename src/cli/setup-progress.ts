// The wire between `t3d setup` and examples/neural-server/install.py: the installer prints one
// `@t3d {json}` line per event (plan, step, end); this parses them, runs the installer with its
// stdout read line by line (stderr passes through), and prints each event for humans.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export interface PlanStep {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly done: boolean;
  readonly optional: boolean;
  readonly licence?: string | null;
  readonly cmds: readonly string[];
}

export type Progress =
  | {
      readonly event: 'plan';
      readonly profile: string;
      readonly home: string;
      readonly log: string;
      readonly steps: readonly PlanStep[];
      readonly gated: readonly {
        readonly repo: string;
        readonly url: string;
        readonly why: string;
      }[];
      readonly notes: readonly string[];
    }
  | {
      readonly event: 'step';
      readonly id: string;
      readonly status: 'start' | 'done' | 'skip' | 'fail' | 'warn';
      readonly title?: string;
      readonly detail?: string;
      readonly fix?: string;
    }
  | {
      readonly event: 'end';
      readonly ok: boolean;
      readonly done: number;
      readonly skipped: number;
      readonly failed: readonly string[];
    };

/** One installer stdout line → its progress event; any other line → undefined. */
export function parseProgress(line: string): Progress | undefined {
  if (!line.startsWith('@t3d ')) return undefined;
  try {
    const v = JSON.parse(line.slice(5)) as { event?: unknown };
    return v.event === 'plan' || v.event === 'step' || v.event === 'end'
      ? (v as Progress)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Runs one process, calls `onLine` per stdout line; resolves to the exit code. Injectable. */
export type LineRunner = (
  cmd: readonly string[],
  env: Readonly<Record<string, string>>,
  onLine: (line: string) => void,
) => Promise<number>;

export const spawnLines: LineRunner = (cmd, env, onLine) =>
  new Promise((done) => {
    const [exe = '', ...args] = cmd;
    const child = spawn(exe, args, { env, stdio: ['ignore', 'pipe', 'inherit'] });
    createInterface({ input: child.stdout }).on('line', onLine);
    child.on('error', () => done(127));
    child.on('close', (code) => done(code ?? 1));
  });

export function sayPlan(
  ev: Extract<Progress, { event: 'plan' }>,
  dry: boolean,
  say: (l: string) => void,
): void {
  say(`${dry ? 'plan' : 'setup'} ${ev.profile} → ${ev.home}  (log: ${ev.log})`);
  for (const s of ev.steps) {
    say(
      `  ${s.done ? '=' : '+'} ${s.id.padEnd(22)} ${s.title}${s.optional ? ' (optional)' : ''}${s.licence ? ` [${s.licence}]` : ''}`,
    );
    if (dry && !s.done) for (const c of s.cmds) say(`      $ ${c}`);
  }
  for (const g of ev.gated) say(`  gated (accept at ${g.url} to use): ${g.repo} — ${g.why}`);
  for (const n of ev.notes) say(`  note: ${n}`);
  if (dry)
    say(
      `${ev.steps.filter((s) => !s.done).length} to do, ${ev.steps.filter((s) => s.done).length} already done; run without --dry-run to install`,
    );
}

export function saySteps(ev: Extract<Progress, { event: 'step' }>, say: (l: string) => void): void {
  if (ev.status === 'start') say(`  … ${ev.id}  ${ev.title ?? ''}`);
  else if (ev.status === 'done') say(`  ✔ ${ev.id}`);
  else if (ev.status === 'warn')
    say(`  ! ${ev.id} (optional) ${ev.detail ?? ''}\n      fix: ${ev.fix ?? ''}`);
  else if (ev.status === 'fail') say(`  ✘ ${ev.id} ${ev.detail ?? ''}\n      fix: ${ev.fix ?? ''}`);
}
