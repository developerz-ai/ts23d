import { describe, expect, it } from 'bun:test';
import { crossRecipeImports } from './recipe-imports.ts';

describe('crossRecipeImports', () => {
  it('fails an import of another asset folder module or data file', () => {
    const v = crossRecipeImports(
      'recipes/rts_tank/rts_tank.ts',
      "import { a } from '../rts_faction/style.ts';\nimport d from '../real_valley/data/dem.json';",
    );
    expect(v.map((x) => x.line)).toEqual([1, 2]);
    expect(v[0]?.fix).toContain('recipes/_lib/');
  });

  it('passes own modules, shared folders, entry files and library imports', () => {
    const ok = [
      "import { a } from './head.ts';",
      "import { b } from '../_lib/rts/style.ts';",
      "import { c } from '../_parts/rivets.ts';",
      "import { tiger_1 } from '../tiger_1/tiger_1.ts';",
      "import { compile } from '../../src/core/index.ts';",
      "export { x } from './x.ts';",
    ].join('\n');
    expect(crossRecipeImports('recipes/demo/demo.ts', ok)).toEqual([]);
    expect(
      crossRecipeImports('recipes/demo/parts/leg.ts', "import { y } from '../head.ts';"),
    ).toEqual([]);
  });
});
