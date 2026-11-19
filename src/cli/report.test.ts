import { expect, it } from 'bun:test';
import type { Finding } from '../qa/index.ts';
import { envelope, findingLine, foldLods, jsonStdout, lodLabel } from './report.ts';

const f = (message: string, extra: Partial<Finding> = {}): Finding => ({
  gate: 'floating-parts',
  code: 'T3D_QA_FLOATING_PARTS',
  part: 'wheel',
  message,
  fix: 'move it onto hull',
  ...extra,
});

it('labels LOD sets as a range only when contiguous', () => {
  expect(lodLabel([0, 1, 2])).toBe('0-2');
  expect(lodLabel([0, 2])).toBe('0,2');
  expect(lodLabel([2, 0])).toBe('0,2');
  expect(lodLabel([1])).toBe('1');
});

it('folds a finding that holds at every LOD into one LOD0-2 line, keeps different ones apart', () => {
  const folded = foldLods([
    { lod: 0, findings: [f('floats'), f('sunk', { gate: 'clashes', code: 'T3D_QA_CLASHES' })] },
    { lod: 1, findings: [f('floats')] },
    { lod: 2, findings: [f('floats'), f('floats', { gap: 0.05 })] },
  ]);
  expect(folded.map((x) => x.message)).toEqual(['LOD0-2: floats', 'LOD0: sunk', 'LOD2: floats']);
  expect(folded[2]?.gap).toBe(0.05);
});

it('prints the code, and gap / nearest when present', () => {
  const line = findingLine(f('LOD0: floats', { gap: 0.0312, nearest: 'hull' }));
  expect(line).toContain('T3D_QA_FLOATING_PARTS floating-parts [wheel]: LOD0: floats');
  expect(line).toContain('gap 0.031 m, nearest hull');
  expect(line).toContain('fix: move it onto hull');
  expect(findingLine(f('x'))).not.toContain('gap');
});

it('--json: console.log, console.info and console.debug go to stderr until undone', () => {
  const saved = {
    log: console.log,
    info: console.info,
    debug: console.debug,
    error: console.error,
  };
  const out: string[] = [];
  const err: string[] = [];
  console.log = (m: string) => void out.push(m);
  console.info = (m: string) => void out.push(m);
  console.debug = (m: string) => void out.push(m);
  console.error = (m: string) => void err.push(m);
  try {
    const restore = jsonStdout();
    console.log('log');
    console.info('info');
    console.debug('debug');
    envelope(true, 1);
    restore();
    console.info('after');
  } finally {
    Object.assign(console, saved);
  }
  expect(err).toEqual(['log', 'info', 'debug']);
  expect(out).toEqual(['{"ok":true,"data":1}', 'after']);
});

it('--json: a direct process.stdout.write goes to stderr too; the envelope stays on stdout', () => {
  const saved = { log: console.log, out: process.stdout.write, err: process.stderr.write };
  const out: string[] = [];
  const err: string[] = [];
  const sink =
    (into: string[]) =>
    (chunk: string | Uint8Array): boolean => {
      into.push(String(chunk));
      return true;
    };
  process.stdout.write = sink(out) as typeof process.stdout.write;
  process.stderr.write = sink(err) as typeof process.stderr.write;
  // Node's console.log writes through process.stdout.write: model that.
  console.log = (m: string) => void process.stdout.write(`${m}\n`);
  try {
    const restore = jsonStdout();
    process.stdout.write('recipe noise\n');
    envelope(true, 2);
    restore();
    process.stdout.write('after\n');
  } finally {
    Object.assign(console, { log: saved.log });
    process.stdout.write = saved.out;
    process.stderr.write = saved.err;
  }
  expect(err).toEqual(['recipe noise\n']);
  expect(out).toEqual(['{"ok":true,"data":2}\n', 'after\n']);
});
