import { expect, it } from 'bun:test';
import { join } from 'node:path';
import { CUSTOM_STRIP_SLOTS } from '../src/material/index.ts';
import { type RowReport, rowClashes, rowDiff } from './material-rows.ts';

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
  expect(rowDiff({ rock: ['granite'] }, { rock: ['granite', 'moss'] })).toHaveLength(1);
});

it('fails: names two materials one asset holds on the same row, and nothing for one per row', () => {
  const rowOf = (id: string): number => ({ granite: 4, scales: 4, bark: 9 })[id] ?? -1;
  expect(rowClashes(['granite', 'bark', 'scales'], rowOf)).toEqual([
    "'granite' and 'scales' both hold row 4",
  ]);
  expect(rowClashes(['granite', 'bark'], rowOf)).toEqual([]);
});

it('loads every recipe and library material in one process, in either order: one material per row in every asset, the same rows and materials both ways', async () => {
  const [forward, reverse] = await Promise.all([run(), run('--reverse')]);
  // A clash prints as T3D_MATERIAL_CONFLICT naming the asset: give one of its two a free `row`.
  expect(forward.errors).toEqual([]);
  expect(reverse.errors).toEqual([]);
  // Load order changes neither a material's row nor what an asset maps onto (D299).
  expect(rowDiff(forward.rows, reverse.rows)).toEqual([]);
  expect(rowDiff(forward.assets, reverse.assets)).toEqual([]);
  const rows = Object.values(forward.rows);
  expect(rows.length).toBeGreaterThan(8);
  expect(rows.every((r) => Number.isInteger(r) && r >= 0 && r < CUSTOM_STRIP_SLOTS)).toBe(true);
  const used = Object.values(forward.assets);
  expect(used.filter((ids) => ids.length > 0).length).toBeGreaterThan(8);
  for (const ids of used) {
    expect(ids.length).toBeLessThanOrEqual(CUSTOM_STRIP_SLOTS);
    expect(new Set(ids.map((id) => forward.rows[id])).size).toBe(ids.length);
  }
}, 300000);
