// Run one `t3d` command in-process with --json and return its envelope, so every MCP tool takes
// the same path (and gets the same codes and fixes) as the CLI. The envelope is caught from
// console.log; every other line the run prints goes to stderr, never into the stdio transport.
// Calls are serialised: the console swap is process-wide, and builds share the painted sheet.

import { Ts23dError } from '../../core/index.ts';
import type { ErrorJson } from '../report.ts';
import { run } from '../run.ts';

export interface Envelope {
  readonly ok: boolean;
  readonly data?: unknown;
  readonly error?: ErrorJson;
}

export interface Invoked {
  readonly exit: number;
  readonly envelope: Envelope;
}

let queue: Promise<unknown> = Promise.resolve();

/** Run after every call queued before it; a failing call does not block the next. */
function serial<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
}

function parse(lines: readonly string[], argv: readonly string[]): Envelope {
  const last = lines.at(-1);
  try {
    const env: unknown = last === undefined ? undefined : JSON.parse(last);
    if (env && typeof env === 'object' && typeof (env as { ok?: unknown }).ok === 'boolean')
      return env as Envelope;
  } catch {
    // Not JSON: fall through to the coded error below.
  }
  throw new Ts23dError('T3D_RECIPE_THREW', {
    cause: `t3d ${argv[0] ?? ''} --json printed no envelope (${lines.length} line(s) on stdout)`,
    fix: 'run the same command in a shell with --json to see the output; open an issue if it persists',
  });
}

/** `t3d <argv…> --json`, its exit code and its one envelope. */
export function invoke(argv: readonly string[]): Promise<Invoked> {
  return serial(async () => {
    const lines: string[] = [];
    const log = console.log;
    console.log = (...parts: unknown[]) => {
      lines.push(parts.map(String).join(' '));
    };
    try {
      const exit = await run([...argv, '--json']);
      return { exit, envelope: parse(lines, argv) };
    } finally {
      console.log = log;
    }
  });
}
