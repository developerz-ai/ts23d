// The packaging contract the smoke test enforces: explicit exports and a clean tarball listing.

import { expect, it } from 'bun:test';
import { expectedExports, exportTargets, tarballProblems } from './pack-smoke.ts';

const CLEAN = [
  'package.json',
  'CLAUDE.md',
  'NOTICE',
  'dist/index.js',
  'dist/index.d.ts',
  'src/index.ts',
];
const TARGETS = ['dist/index.js', 'dist/index.d.ts', 'src/index.ts', 'package.json'];

it('rejects a listing that ships a test file, a demo PNG or a source map', () => {
  expect(tarballProblems([...CLEAN, 'recipes/t34/t34.test.ts'], TARGETS)).toEqual([
    'ships a test file: recipes/t34/t34.test.ts',
  ]);
  expect(tarballProblems([...CLEAN, 'recipes/tune_demo/tune-strip.png'], TARGETS)).toEqual([
    'ships a demo PNG: recipes/tune_demo/tune-strip.png',
  ]);
  expect(tarballProblems([...CLEAN, 'dist/chunk-a.js.map'], TARGETS)).toEqual([
    'ships a source map: dist/chunk-a.js.map',
  ]);
});

it('rejects a listing missing CLAUDE.md or an exports target', () => {
  const problems = tarballProblems(
    CLEAN.filter((f) => f !== 'CLAUDE.md'),
    [...TARGETS, 'dist/cli/index.js'],
  );
  expect(problems).toContain('CLAUDE.md (the agent brain AGENTS.md links to) is missing');
  expect(problems).toContain('exports target missing: dist/cli/index.js');
});

it('accepts a clean listing', () => {
  expect(tarballProblems(CLEAN, TARGETS)).toEqual([]);
});

it('package.json exports are exactly the root, TIERS minus cli, and ./package.json', async () => {
  const pkg = (await Bun.file('package.json').json()) as { exports: Record<string, unknown> };
  expect(Object.keys(pkg.exports)).toEqual(expectedExports());
  expect(expectedExports()).not.toContain('./cli');
  expect(expectedExports()).toHaveLength(18);
});

it('every module export points at its dist types, its src for bun and its dist JS', async () => {
  const pkg = (await Bun.file('package.json').json()) as { exports: Record<string, unknown> };
  expect(pkg.exports['./qa']).toEqual({
    types: './dist/qa/index.d.ts',
    bun: './src/qa/index.ts',
    default: './dist/qa/index.js',
  });
  expect(exportTargets({ '.': { a: './x.js', b: './x.js' }, './p': './p.json' })).toEqual([
    'p.json',
    'x.js',
  ]);
});

it('rejects a listing missing NOTICE', () => {
  const problems = tarballProblems(
    CLEAN.filter((f) => f !== 'NOTICE'),
    TARGETS,
  );
  expect(problems).toContain('NOTICE (third-party acknowledgements) is missing');
});
