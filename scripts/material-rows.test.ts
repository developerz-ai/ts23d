import { expect, it } from 'bun:test';
import { join } from 'node:path';
import { CUSTOM_STRIP_SLOTS } from '../src/material/index.ts';
import { type RowReport, rowDiff } from './material-rows.ts';

const root = join(import.meta.dir, '..');

/** One fresh process: module-level `defineMaterial` calls run once per process. */
async function run(...flags: string[]): Promise<RowReport> {
  const p = Bun.spawn(['bun', 'scripts/material-rows.ts', ...flags], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [out, err] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
  ]);
  await p.exited;
  const line = out.trim().split('\n').at(-1) ?? '';
  if (!line.startsWith('{')) throw new Error(`material-rows printed no report: ${err || out}`);
  return JSON.parse(line) as RowReport;
}

it('names the ids whose rows differ between two loads', () => {
  expect(rowDiff({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 })).toEqual([
    'b: row 2 vs 3',
    'c: row none vs 4',
  ]);
  expect(rowDiff({ a: 1 }, { a: 1 })).toEqual([]);
});

it('loads every recipe and library material in one process, in either order, on the same rows', async () => {
  const [forward, reverse] = await Promise.all([run(), run('--reverse')]);
  // A clash prints as T3D_MATERIAL_CONFLICT with the free rows: give one of the two a `row`.
  expect(forward.errors).toEqual([]);
  expect(reverse.errors).toEqual([]);
  expect(rowDiff(forward.rows, reverse.rows)).toEqual([]);
  const rows = Object.values(forward.rows);
  expect(rows.length).toBeGreaterThan(8);
  expect(rows.length).toBeLessThanOrEqual(CUSTOM_STRIP_SLOTS);
  expect(new Set(rows).size).toBe(rows.length);
}, 300000);
