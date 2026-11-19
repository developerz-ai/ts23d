// `t3d <command> <bad argument> --json`: every command, including the ones that parse their own
// flags (concept, doctor, setup, server, plan, blender, init), leaves exactly one envelope on
// stdout with ok:false and an error carrying code and fix; nothing else goes to stdout.

import { expect, it } from 'bun:test';
import { run } from './run.ts';

/** Runs argv + --json; returns every stdout line (console.log at start) and the exit code. */
async function stdoutOf(argv: readonly string[]): Promise<{ code: number; lines: string[] }> {
  const { log, error } = console;
  const lines: string[] = [];
  console.log = (m: unknown) => {
    lines.push(String(m));
  };
  console.error = () => {};
  try {
    const code = await run([...argv, '--json']);
    return { code, lines };
  } finally {
    Object.assign(console, { log, error });
  }
}

const CASES: readonly (readonly string[])[] = [
  ['concept', 'a.ts', '--variants', '0'],
  ['concept', 'a.ts', '--nope'],
  ['doctor', 'extra'],
  ['setup', 'no-such-profile'],
  ['server', 'nope'],
  ['server', 'status', '--port', 'x'],
  ['plan', 'nope'],
  ['plan', 'check', '--nope'],
  ['blender', 'nope'],
  ['blender', 'review', '--views', 'nope'],
  ['blender', 'session', 'nope'],
  ['init', '--engine', 'nope'],
  ['neural', '--nope'],
  ['tune', '--nope'],
  ['finish', '--nope'],
  ['icon', '--nope'],
  ['build', '--nope'],
  ['nope'],
];

for (const argv of CASES)
  it(`t3d ${argv.join(' ')} --json: one ok:false envelope with error.code and error.fix`, async () => {
    const { code, lines } = await stdoutOf(argv);
    expect(lines).toHaveLength(1);
    const env = JSON.parse(lines[0] ?? '') as {
      ok: boolean;
      error?: { code?: string; message?: string; fix?: string };
    };
    expect(env.ok).toBe(false);
    expect(env.error?.code).toBe('T3D_CLI_USAGE');
    expect(env.error?.message).toBeTruthy();
    expect(env.error?.fix).toBeTruthy();
    expect(code).toBe(2);
  });
