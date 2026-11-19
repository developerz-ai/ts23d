// The tarball's weight limits: a listing read from real tar bytes, and every over-budget case named.

import { expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { budgetProblems, PACK_BUDGET, type TarEntry, tarEntries } from './pack-budget.ts';

const MB = 1_000_000;
const LONG = `src/${'deep/'.repeat(25)}file.ts`;

async function tgz(format: 'gnu' | 'pax', files: Record<string, number>): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), 'ts23d-pack-budget-'));
  try {
    for (const [path, size] of Object.entries(files)) {
      const at = join(dir, 'package', path);
      await mkdir(dirname(at), { recursive: true });
      await writeFile(at, new Uint8Array(size));
    }
    const out = join(dir, 'p.tgz');
    const p = Bun.spawnSync(['tar', `--format=${format}`, '-czf', out, 'package'], { cwd: dir });
    if (p.exitCode !== 0) throw new Error(p.stderr.toString());
    return new Uint8Array(await Bun.file(out).arrayBuffer());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const sorted = (e: readonly TarEntry[]) => [...e].sort((a, b) => (a.path < b.path ? -1 : 1));

for (const format of ['gnu', 'pax'] as const) {
  it(`reads every regular file, its size and a > 100-char path from a ${format} tarball`, async () => {
    const entries = tarEntries(await tgz(format, { 'package.json': 12, [LONG]: 700, 'a/b.md': 0 }));
    expect(sorted(entries)).toEqual([
      { path: 'a/b.md', size: 0 },
      { path: 'package.json', size: 12 },
      { path: LONG, size: 700 },
    ]);
  });
}

it('rejects a tarball over the packed or unpacked budget and names the largest files', () => {
  const entries = [
    { path: 'dist/index.js', size: 0.5 * MB },
    { path: 'src/index.ts', size: 0.2 * MB },
  ];
  const budget = { packedBytes: 1 * MB, unpackedBytes: 0.6 * MB, fileBytes: 1 * MB };
  const problems = budgetProblems(entries, 2 * MB, budget);
  expect(problems).toHaveLength(2);
  expect(problems[0]).toStartWith('tarball is 2.00 MB packed, budget 1.00 MB');
  expect(problems[1]).toStartWith('tarball is 0.70 MB unpacked, budget 0.60 MB');
  expect(problems[1]).toContain('dist/index.js (0.50 MB), src/index.ts (0.20 MB)');
  expect(problems[1]).toContain('package.json "files"');
});

it('rejects a single file over the per-file limit', () => {
  const problems = budgetProblems([{ path: 'docs/media/demo.mp4', size: 3 * MB }], 1, {
    ...PACK_BUDGET,
    unpackedBytes: 10 * MB,
  });
  expect(problems).toEqual([
    'ships a 3.00 MB file (limit 1.00 MB): docs/media/demo.mp4; exclude it in package.json "files"',
  ]);
});

it('rejects any recipes/*/neural/ file, however small: model outputs stay in git', () => {
  const problems = budgetProblems(
    [
      { path: 'recipes/bear_hybrid/neural/abc/record.json', size: 900 },
      { path: 'recipes/bear_hybrid/bear_hybrid.ts', size: 900 },
    ],
    1,
  );
  expect(problems).toHaveLength(1);
  expect(problems[0]).toStartWith(
    'ships a model output: recipes/bear_hybrid/neural/abc/record.json',
  );
  expect(problems[0]).toContain('"!recipes/*/neural"');
});

it('accepts a listing inside every limit', () => {
  expect(budgetProblems([{ path: 'dist/index.js', size: 0.5 * MB }], 0.2 * MB)).toEqual([]);
});
