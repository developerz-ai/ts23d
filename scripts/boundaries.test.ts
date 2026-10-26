import { expect, it } from 'bun:test';
import { checkFile } from './boundaries.ts';

it('allows downward imports through index.ts', () => {
  expect(checkFile('src/kinds/a.ts', "import { box } from '../primitives/index.ts';")).toEqual([]);
});

it('refuses upward, sideways and deep imports', () => {
  expect(checkFile('src/core/a.ts', "import { x } from '../qa/index.ts';")).toHaveLength(1);
  expect(checkFile('src/qa/a.ts', "import { x } from '../export/index.ts';")).toHaveLength(1);
  expect(checkFile('src/kinds/a.ts', "import { x } from '../core/mesh.ts';")).toHaveLength(1);
});
