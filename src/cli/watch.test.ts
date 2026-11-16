// Watch: a failing build does not stop it; a change rebuilds only the recipes whose import graph
// holds the changed file; a new recipe folder builds; flags pass through to every rebuild.

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFlags, dependants, entriesOf, importGraph, startWatch } from './watch.ts';

let dir = '';
const put = (rel: string, text: string): string => {
  const p = join(dir, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, text);
  return p;
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 't3d-watch-'));
  put('assets/_lib/rivets.ts', 'export const r = 1;\n');
  put('assets/wolf/legs.ts', "import { r } from '../_lib/rivets.ts';\nexport const l = r;\n");
  put('assets/wolf/wolf.ts', "import { l } from './legs.ts';\nexport const wolf = l;\n");
  put('assets/wolf/wolf.test.ts', "import './wolf.ts';\n");
  put(
    'assets/crate/crate.ts',
    "import type { X } from '../_lib/rivets.ts';\nexport const c = 1;\n",
  );
  put('assets/style.ts', 'export const style = 1;\n');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function harness(results: number[] = []) {
  const builds: string[][] = [];
  const log: string[] = [];
  const w = startWatch([join(dir, 'assets')], {
    build: async (files) => {
      builds.push(files.map((f) => f.slice(dir.length + 1)));
      return results.shift() ?? 0;
    },
    watch: () => ({ close() {} }),
    log: (l) => log.push(l),
    debounceMs: 1,
  });
  return { w, builds, log };
}

describe('t3d build --watch', () => {
  it('a failing build is reported and the watch goes on', async () => {
    const { w, builds, log } = harness([1, 0]);
    await w.first();
    expect(log.some((l) => l.includes('exited 1') && l.includes('still watching'))).toBe(true);
    w.changed([join(dir, 'assets/crate/crate.ts')]);
    await w.flush();
    expect(builds.at(-1)).toEqual(['assets/crate/crate.ts']);
    w.close();
  });

  it('entries: <dir>/<n>/<n>.ts, never _lib, tests or style.ts', () => {
    const e = entriesOf([join(dir, 'assets')]).map((f) => f.slice(dir.length + 1));
    expect(e).toEqual(['assets/crate/crate.ts', 'assets/wolf/wolf.ts']);
  });

  it('a shared part rebuilds only the recipes that import it (type imports do not count)', () => {
    const entries = entriesOf([join(dir, 'assets')]);
    const g = importGraph(entries);
    const hit = (f: string) =>
      dependants(g, entries, [join(dir, f)]).map((x) => x.slice(dir.length + 1));
    expect(hit('assets/_lib/rivets.ts')).toEqual(['assets/wolf/wolf.ts']);
    expect(hit('assets/wolf/legs.ts')).toEqual(['assets/wolf/wolf.ts']);
    expect(hit('assets/crate/crate.ts')).toEqual(['assets/crate/crate.ts']);
    expect(hit('assets/README.md')).toEqual([]);
  });

  it('changes debounce into one rebuild; a new recipe folder builds', async () => {
    const { w, builds } = harness();
    await w.first();
    expect(builds).toEqual([['assets/crate/crate.ts', 'assets/wolf/wolf.ts']]);
    w.changed([join(dir, 'assets/_lib/rivets.ts')]);
    w.changed([join(dir, 'assets/wolf/legs.ts')]);
    put('assets/fox/fox.ts', 'export const fox = 1;\n');
    w.changed([join(dir, 'assets/fox')]);
    await w.flush();
    expect(builds.slice(1)).toEqual([['assets/fox/fox.ts', 'assets/wolf/wolf.ts']]);
    w.close();
  });

  it('flags pass through; --watch and files do not', () => {
    const argv = [
      'build',
      '--watch',
      'assets',
      '--out',
      'models',
      '--profile',
      'godot',
      '--no-shot',
    ];
    expect(buildFlags(argv)).toEqual({
      files: ['assets'],
      flags: ['--out', 'models', '--profile', 'godot', '--no-shot'],
    });
  });
});
