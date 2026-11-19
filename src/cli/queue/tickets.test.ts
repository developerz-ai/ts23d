// A ticket's writers do not undo each other: listing a tool (`addProc`) while the grant is
// released, or while `t3d queue clear` drops the ticket from another process, leaves the ticket
// released, with no warning and no stray file.

import { describe, expect, test } from 'bun:test';
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { acquire } from './acquire.ts';
import { clearTickets } from './cmd.ts';
import { fakeWorld } from './fake-world.ts';
import { addTicketProc, readTicket, releaseTicket, ticketFile } from './tickets.ts';

const ROUNDS = 25;

describe('ticket writers', () => {
  test('addProc overlapping release in one process: released, no warning, no draft left', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const w = await fakeWorld();
      const g = await acquire('blender', 1, w.proc(100));
      const adds = [g.addProc(process.pid), g.addProc(1)];
      await g.release();
      await Promise.all(adds);
      expect((await w.lineup('blender', 1)).live).toHaveLength(0);
      expect(w.lines).toEqual([]);
      const files = await readdir(join(w.home, 'queue', 'blender'));
      expect(files.filter((f) => f.startsWith('draft.'))).toEqual([]);
      // A tool heard of after the release is not written at all.
      await g.addProc(process.pid);
      expect((await w.lineup('blender', 1)).live).toHaveLength(0);
    }
  });

  test('addProc overlapping `queue clear --all`: the ticket stays dropped', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const w = await fakeWorld();
      const g = await acquire('blender', 1, w.proc(100));
      const add = g.addProc(process.pid);
      const dropped = await clearTickets({ TS23D_HOME: w.home }, { what: 'all' });
      await add;
      expect(dropped).toBe(1);
      expect((await w.lineup('blender', 1)).live).toHaveLength(0);
      expect(w.lines).toEqual([]);
    }
  });

  test('a write that loses to a release from another process does not bring the ticket back', async () => {
    const w = await fakeWorld();
    await acquire('blender', 1, w.proc(100));
    const dir = join(w.home, 'queue', 'blender');
    const ticket = await readTicket(dir, 1);
    const token = ticket?.token ?? '';
    // The other process releases between this writer's read and its rename.
    const added = await addTicketProc(dir, 1, token, { pid: 7, start: 'start-7' }, async () => {
      expect(await releaseTicket(dir, 1, token)).toBe(true);
    });
    expect(added).toBe(false);
    expect(await readTicket(dir, 1)).toBeUndefined();
    // Even a writer that renames its stale copy in afterwards changes nothing.
    await writeFile(ticketFile(dir, 1), JSON.stringify(ticket));
    expect(await readTicket(dir, 1)).toBeUndefined();
    expect((await w.lineup('blender', 1)).live).toHaveLength(0);
    expect(await releaseTicket(dir, 1, token)).toBe(false);
  });

  test('addProc lists a process once, and only on the ticket that carries the token', async () => {
    const w = await fakeWorld();
    await acquire('blender', 1, w.proc(100));
    const dir = join(w.home, 'queue', 'blender');
    const token = (await readTicket(dir, 1))?.token ?? '';
    const tool = { pid: 7, start: 'start-7' };
    expect(await addTicketProc(dir, 1, 'another-token', tool)).toBe(false);
    expect(await addTicketProc(dir, 1, token, tool)).toBe(true);
    expect(await addTicketProc(dir, 1, token, tool)).toBe(false);
    expect((await readTicket(dir, 1))?.procs).toEqual([{ pid: 100, start: 'start-100' }, tool]);
  });
});
