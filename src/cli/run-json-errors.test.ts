// `t3d <command> <bad argument> --json`: every command, including the ones that parse their own
// flags (concept, doctor, setup, server, plan, blender, init, queue), leaves exactly one envelope on
// stdout with ok:false and an error carrying code and fix; nothing else goes to stdout, by any
// route (console.log / info / debug with any number of arguments, or `process.stdout.write`).

import { expect, it } from 'bun:test';
import { run } from './run.ts';

type Write = typeof process.stdout.write;

/**
 * Runs `task` and returns every byte it sent to stdout, with stderr muted. Bun's console writes
 * natively, not through `process.stdout.write`, so both routes are captured.
 */
async function capture<T>(task: () => Promise<T>): Promise<{ result: T; stdout: string }> {
  const { log, info, debug, error, warn } = console;
  const [out, err] = [process.stdout.write, process.stderr.write];
  const decoder = new TextDecoder();
  let stdout = '';
  const line = (...parts: unknown[]): void => {
    stdout += `${parts.map(String).join(' ')}\n`;
  };
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += typeof chunk === 'string' ? chunk : decoder.decode(chunk);
    return true;
  }) as Write;
  process.stderr.write = (() => true) as Write;
  Object.assign(console, { log: line, info: line, debug: line, error: () => {}, warn: () => {} });
  try {
    return { result: await task(), stdout };
  } finally {
    Object.assign(console, { log, info, debug, error, warn });
    process.stdout.write = out;
    process.stderr.write = err;
  }
}

const stdoutOf = async (argv: readonly string[]): Promise<{ code: number; stdout: string }> => {
  // Before a `--`: what follows one belongs to the command `t3d queue run` starts.
  const at = argv.includes('--') ? argv.indexOf('--') : argv.length;
  const line = [...argv.slice(0, at), '--json', ...argv.slice(at)];
  const { result, stdout } = await capture(() => run(line));
  return { code: result, stdout };
};

it('the harness sees stdout by every route, so a stray line cannot hide', async () => {
  const { stdout } = await capture(async () => {
    console.log('{"ok":false}');
    console.log('two', 'arguments');
    console.info('info');
    console.debug('debug');
    process.stdout.write('write\n');
    process.stdout.write(new TextEncoder().encode('bytes\n'));
    console.error('stderr is not stdout');
  });
  expect(stdout.split('\n')).toEqual([
    '{"ok":false}',
    'two arguments',
    'info',
    'debug',
    'write',
    'bytes',
    '',
  ]);
});

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
  ['queue'],
  ['queue', 'nope'],
  ['queue', 'clear', '--pid', 'x'],
  ['queue', 'run', '--cpu', '0', '--', 'true'],
  ['build', 'a.ts', '--max-wait', 'soon'],
  ['nope'],
];

for (const argv of CASES)
  it(`t3d ${argv.join(' ')} --json: one ok:false envelope with error.code and error.fix`, async () => {
    const { code, stdout } = await stdoutOf(argv);
    // One line, newline-terminated, and nothing before or after it.
    expect(stdout.endsWith('\n')).toBe(true);
    const lines = stdout.slice(0, -1).split('\n');
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
