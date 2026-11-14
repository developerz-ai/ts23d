import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pages } from './changelog.ts';
import {
  bareErrors,
  changelogDocs,
  decimatesCode,
  defectRows,
  errorsDoc,
  kindsDrift,
  missingHeader,
  realSources,
} from './conventions.ts';

const src = (file: string, text: string) => ({ file, text });

describe('bareErrors', () => {
  it('fails new/throw Error, RangeError, TypeError with the line', () => {
    const v = bareErrors(
      src(
        'src/a.ts',
        "// ok\nthrow new RangeError('x');\nconst e = TypeError('y');\nthrow Error('z');",
      ),
    );
    expect(v.map((x) => x.line)).toEqual([2, 4]);
    expect(v[0]?.fix).toContain('Ts23dError');
  });

  it('passes Ts23dError and comments that mention Error(', () => {
    expect(
      bareErrors(src('src/a.ts', "// never new Error(\nthrow new Ts23dError('T3D_X', f);")),
    ).toEqual([]);
  });
});

describe('missingHeader', () => {
  it('fails a file that starts with code', () => {
    expect(missingHeader(src('src/a.ts', "import x from './x.ts';"))).toHaveLength(1);
  });

  it('passes a comment first line, also after a shebang', () => {
    expect(missingHeader(src('src/a.ts', '// does a thing\nexport {};'))).toEqual([]);
    expect(missingHeader(src('src/a.ts', '#!/usr/bin/env bun\n/* job */'))).toEqual([]);
  });
});

describe('errorsDoc', () => {
  const doc = (text: string) => src('docs/architecture/errors.md', text);

  it('fails an undocumented code in src and a documented code nothing raises', () => {
    const v = errorsDoc(
      [src('src/a.ts', "\nthrow new Ts23dError('T3D_NEW', f);")],
      doc('| `T3D_GONE` | x |'),
      {},
    );
    expect(v.map((x) => `${x.file}:${x.line} ${x.message}`)).toEqual([
      'src/a.ts:2 T3D_NEW is not in docs/architecture/errors.md',
      'docs/architecture/errors.md:1 T3D_GONE is documented but nothing in src/ raises it',
    ]);
  });

  it('passes literal codes, gate-generated T3D_QA_<GATE>, env names and wildcards', () => {
    const files = [
      src('src/a.ts', "throw new Ts23dError('T3D_A', f); process.env['T3D_SHARD'];"),
      src('src/qa/g.ts', "return [{ gate: 'floating-parts', code: CODE }];"),
    ];
    const text = '`T3D_A` · `T3D_QA_FLOATING_PARTS` · `T3D_WEATHER_*` · `T3D_QA_<GATE>`';
    expect(errorsDoc(files, doc(text), {})).toEqual([]);
  });

  it('excuses a pending code until src raises it, then flags the stale entry', () => {
    const pending = { T3D_LATER: 'slice 07' };
    expect(errorsDoc([], doc('`T3D_LATER`'), pending)).toEqual([]);
    const v = errorsDoc([src('src/a.ts', "'T3D_LATER'")], doc('`T3D_LATER`'), pending);
    expect(v.map((x) => x.message)).toEqual([expect.stringContaining('stale PENDING_CODES')]);
  });
});

describe('decimatesCode', () => {
  it('fails simplify( on code-built geometry', () => {
    expect(decimatesCode(src('recipes/a/a.ts', 'const m = simplify(box(1));'))).toHaveLength(1);
  });

  it('passes simplify( beside importGlb', () => {
    expect(
      decimatesCode(src('recipes/a/a.ts', 'const m = simplify(importGlb(bytes).mesh);')),
    ).toEqual([]);
  });
});

describe('realSources and kindsDrift', () => {
  it('fails a vehicle without sources and measures', () => {
    const v = realSources([
      src('recipes/car/car.ts', "x\n  kind: 'vehicle',\n  real: { length: 4 },"),
    ]);
    expect(v).toHaveLength(1);
    expect(v[0]?.line).toBe(2);
    expect(v[0]?.message).toContain('sources, measures');
  });

  it('passes when the folder declares all three (in any module) and ignores props', () => {
    const car = src('recipes/car/car.ts', "kind: 'building', sources: [a]");
    const mod = src('recipes/car/dims.ts', 'real: { measures: [m] }');
    expect(realSources([car, mod])).toEqual([]);
    expect(realSources([src('recipes/cup/cup.ts', "kind: 'prop'")])).toEqual([]);
  });

  it('fails when src/kinds stops exporting a real kind', () => {
    expect(kindsDrift(src('src/kinds/index.ts', "from './vehicle.ts'"))).toHaveLength(1);
    expect(
      kindsDrift(src('src/kinds/index.ts', "from './vehicle.ts' from './building.ts'")),
    ).toEqual([]);
  });
});

describe('defectRows', () => {
  async function catalogue(rows: string): Promise<{ dir: string; text: string }> {
    const dir = await mkdtemp(join(tmpdir(), 'ts23d-conventions-'));
    await mkdir(join(dir, 'src/qa'), { recursive: true });
    await writeFile(join(dir, 'src/qa/x.test.ts'), '');
    return { dir, text: `| # | Symptom | Cause | Caught by | Status |\n${rows}` };
  }

  it('fails a shipped row with no path, or a path that does not exist', async () => {
    const c = await catalogue(
      '| D1 | s | c | `gaps` gate | shipped |\n| D2 | s | c | `src/qa/gone.test.ts` | shipped |',
    );
    const v = defectRows(src('cat.md', c.text), (p) => existsSync(join(c.dir, p)), {});
    expect(v.map((x) => `${x.line} ${x.message}`)).toEqual([
      '2 D1 is shipped but names no file',
      '3 D2 names src/qa/gone.test.ts, which does not exist',
    ]);
  });

  it('passes existing paths (with :line), planned rows and legacy rows; flags stale legacy', async () => {
    const c = await catalogue(
      '| D1 | s | c | `src/qa/x.test.ts:12` | shipped |\n| D2 | s | c | nothing yet | planned |\n| D3 | s | c | gate | shipped |',
    );
    const exists = (p: string) => existsSync(join(c.dir, p));
    expect(defectRows(src('cat.md', c.text), exists, { D3: 'legacy' })).toEqual([]);
    const stale = defectRows(src('cat.md', c.text), exists, { D1: 'legacy', D3: 'legacy' });
    expect(stale.map((x) => x.message)).toEqual(['stale LEGACY_DEFECT_ROWS entry D1']);
  });
});

describe('changelogDocs', () => {
  const REPO = 'https://github.com/developerz-ai/ts23d';
  const log = `## [Unreleased]\n\n## [0.1.0] - 2026-11-07\n\nFirst.\n\n### Added\n- x\n\n[Unreleased]: ${REPO}/compare/v0.1.0...HEAD\n[0.1.0]: ${REPO}/releases/tag/v0.1.0\n`;

  it('fails a missing summary, a stale link and a missing page, each with the fix', () => {
    const bad = log.replace('First.\n\n', '').replace('v0.1.0...HEAD', 'v0.0.9...HEAD');
    const v = changelogDocs(src('CHANGELOG.md', bad), new Map());
    expect(v.map((x) => `${x.file} ${x.message.split(': ').slice(1).join(': ')}`)).toEqual([
      'CHANGELOG.md [0.1.0] has no summary sentence',
      `CHANGELOG.md [Unreleased] link is ${REPO}/compare/v0.0.9...HEAD, expected ${REPO}/compare/v0.1.0...HEAD`,
      'docs/changelog/0.1.0.md missing',
      'docs/changelog/README.md missing',
    ]);
    expect(v[0]?.fix).toContain('first paragraph');
    expect(v[1]?.fix).toBe('bun run scripts/changelog.ts');
  });

  it('passes a changelog whose index and pages are current', () => {
    expect(changelogDocs(src('CHANGELOG.md', log), pages(log))).toEqual([]);
  });
});
