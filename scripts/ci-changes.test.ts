import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { isDoc, needsRecipes } from './ci-changes.ts';

describe('ci changes', () => {
  it('runs the recipe work for any code, recipe or unknown change', () => {
    expect(needsRecipes(['src/core/ir.ts'])).toBe(true);
    expect(needsRecipes(['docs/maintenance.md', 'scripts/shots.ts'])).toBe(true);
    expect(needsRecipes(['recipes/t34/README.md'])).toBe(true);
    expect(needsRecipes(['recipes/README.md'])).toBe(true);
    expect(needsRecipes(['.github/workflows/ci.yml'])).toBe(true);
    expect(needsRecipes([])).toBe(true);
    expect(needsRecipes(['', '  '])).toBe(true);
  });

  it('skips it when only docs outside recipes/ changed', () => {
    expect(needsRecipes(['README.md', 'docs/maintenance.md', 'docs/img/flow.png', 'LICENSE'])).toBe(
      false,
    );
    expect(isDoc('CHANGELOG.md')).toBe(true);
    expect(isDoc('recipes/wolf/README.md')).toBe(false);
  });

  it('prints a GITHUB_OUTPUT line from stdin', async () => {
    const p = Bun.spawn(['bun', 'run', resolve(import.meta.dir, 'ci-changes.ts')], {
      stdin: new TextEncoder().encode('README.md\ndocs/a.md\n'),
      stdout: 'pipe',
    });
    expect(await new Response(p.stdout).text()).toBe('recipes=false\n');
    expect(await p.exited).toBe(0);
  });
});
