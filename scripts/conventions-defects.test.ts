import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { catalogueIds, citationSources, defectCitations } from './conventions-defects.ts';

const src = (file: string, text: string) => ({ file, text });
// Built at run time: a literal defect number in this file would itself be a citation the real
// tree's check reads.
const d = (n: number): string => `D${n}`;
const doc = (...ids: number[]) =>
  src(
    'docs/architecture/defect-catalogue.md',
    `| # | Symptom | Cause | Caught by | Status |\n|---|---|---|---|---|\n${ids.map((n) => `| ${d(n)} | s | c | x | shipped |`).join('\n')}\n`,
  );

describe('defectCitations', () => {
  it('fails a number cited in code that has no catalogue row, at its first citation', () => {
    const v = defectCitations(
      [
        src('src/a.test.ts', `it('ok (${d(7)})')\n\nit('fails before ${d(9001)}: x')`),
        src('recipes/b/README.md', `a slab (${d(9001)})`),
      ],
      doc(7),
    );
    expect(v.map((x) => `${x.file}:${x.line} ${x.message}`)).toEqual([
      `src/a.test.ts:3 ${d(9001)} is cited (2 places) but has no row in docs/architecture/defect-catalogue.md`,
    ]);
    expect(v[0]?.fix).toContain('add a row');
  });

  it('passes when every cited number has a row, ranges included, and ignores words like D3D or AD12', () => {
    const v = defectCitations(
      [src('src/a.ts', `// ${d(450)}–${d(454)}, ${d(12)}; Direct3D, ${d(3)}D, AD12, ${d(5)}x`)],
      doc(450, 454, 12),
    );
    expect(v).toEqual([]);
  });

  it('reads row ids from the first cell only', () => {
    expect([...catalogueIds(doc(1, 20))]).toEqual([d(1), d(20)]);
    expect(catalogueIds(src('c.md', `| x | see ${d(5)} | y |`)).size).toBe(0);
  });
});

describe('citationSources', () => {
  it('reads code and docs under the roots, never out/, node_modules, dist or other file kinds', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ts23d-citations-'));
    const files = [
      'src/a.ts',
      'recipes/b/README.md',
      'recipes/b/out/b/manifest.md',
      'apps/site/node_modules/x/y.ts',
      'apps/site/dist/z.ts',
      'scripts/c.json',
    ];
    for (const f of files) {
      await mkdir(join(dir, f, '..'), { recursive: true });
      await writeFile(join(dir, f), 'x');
    }
    const got = await citationSources(dir);
    expect(got.map((s) => s.file)).toEqual(['recipes/b/README.md', 'src/a.ts']);
  });
});
