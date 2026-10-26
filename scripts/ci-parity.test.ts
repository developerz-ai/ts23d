// CI must run the same gate as local: the verify job calls `bun run verify`, nothing narrower.

import { expect, it } from 'bun:test';
import { STEPS } from './verify.ts';

it('ci.yml runs the full local gate', async () => {
  const ci = await Bun.file('.github/workflows/ci.yml').text();
  expect(ci).toContain('bun run verify');
  expect(ci).not.toMatch(/bun run verify --only/);
});

it('every package.json gate script is a verify step', async () => {
  const pkg = (await Bun.file('package.json').json()) as { scripts: Record<string, string> };
  for (const s of [
    'lint',
    'typecheck',
    'boundaries',
    'determinism',
    'filesize',
    'recipes',
    'build',
  ]) {
    expect(pkg.scripts[s]).toBeDefined();
    expect(STEPS.map((x) => x.name)).toContain(s as (typeof STEPS)[number]['name']);
  }
});
