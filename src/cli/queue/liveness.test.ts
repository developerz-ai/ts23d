// Is a ticket's owner running? Against a fake /proc: a zombie and a reused pid are not the owner.

import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { procAlive, procOf, procStat } from './liveness.ts';

/** A /proc with this test process (so it counts as a real /proc) and the given pids. */
async function fakeProc(procs: Readonly<Record<number, { state: string; start: string }>>) {
  const root = await mkdtemp(join(tmpdir(), 't3d-proc-'));
  const all = { ...procs, [process.pid]: { state: 'R', start: '1' } };
  for (const [pid, p] of Object.entries(all)) {
    await mkdir(join(root, pid));
    // The command name holds a space and a parenthesis, as real ones may.
    const rest = Array.from({ length: 17 }, () => '0').join(' ');
    await writeFile(
      join(root, pid, 'stat'),
      `${pid} (my (odd) tool) ${p.state} 1 ${rest} ${p.start} 0\n`,
    );
  }
  return root;
}

test('a zombie, a dead pid and a reused pid are not alive; the very process is', async () => {
  const proc = await fakeProc({
    10: { state: 'S', start: '500' },
    11: { state: 'Z', start: '600' },
    12: { state: 'X', start: '700' },
  });
  expect(await procAlive({ pid: 11, start: '600' }, proc)).toBe(false);
  expect(await procAlive({ pid: 12, start: '700' }, proc)).toBe(false);
  expect(await procAlive({ pid: 13, start: '800' }, proc)).toBe(false);
  expect(await procAlive({ pid: 10, start: '499' }, proc)).toBe(false);
  expect(await procAlive({ pid: 10, start: '500' }, proc)).toBe(true);
  expect(await procStat(10, proc)).toEqual({ state: 'S', start: '500' });
  expect(await procOf(10, proc)).toEqual({ pid: 10, start: '500' });
});

test('without /proc only the pid can be asked: this process is alive, a free pid is not', async () => {
  const none = join(tmpdir(), 't3d-no-such-proc');
  expect(await procAlive({ pid: 4194304 /* 2^22 */ + 1 }, none)).toBe(false);
  expect(await procAlive({ pid: process.pid }, none)).toBe(true);
  expect(await procOf(process.pid, none)).toEqual({ pid: process.pid });
});
