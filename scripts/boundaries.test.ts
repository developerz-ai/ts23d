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

it('sees wrapped, dynamic and side-effect imports, in either quote style', () => {
  const wrapped = "import {\n  a,\n  b,\n} from '../qa/index.ts';";
  expect(checkFile('src/core/a.ts', wrapped)).toEqual([
    expect.objectContaining({ file: 'src/core/a.ts', line: 4 }),
  ]);
  expect(checkFile('src/core/a.ts', "const m = await import('../qa/index.ts');")).toHaveLength(1);
  expect(checkFile('src/core/a.ts', "import '../qa/index.ts';")).toHaveLength(1);
  expect(checkFile('src/core/a.ts', 'import { x } from "../qa/index.ts";')).toHaveLength(1);
  expect(checkFile('src/core/a.ts', "export * from '../qa/index.ts';")).toHaveLength(1);
});

it('resolves imports from nested folders to their real module', () => {
  expect(checkFile('src/render/path/a.ts', "import { x } from '../../cli/index.ts';")).toEqual([
    expect.objectContaining({ message: "'render' (tier 3) imports 'cli' (tier 5)" }),
  ]);
  expect(checkFile('src/cli/mcp/a.ts', "import { x } from '../../core/mesh.ts';")).toEqual([
    expect.objectContaining({ message: "deep import '../../core/mesh.ts'" }),
  ]);
  expect(checkFile('src/cli/mcp/a.ts', "import { x } from '../../core/index.ts';")).toEqual([]);
  expect(checkFile('src/cli/mcp/a.ts', "import { x } from '../args.ts';")).toEqual([]);
  expect(checkFile('src/material/tex/a.ts', "import { x } from '../paint/b.ts';")).toEqual([]);
});

it('checks the root barrel and refuses a module importing it', () => {
  expect(checkFile('src/index.ts', "export * from './core/mesh.ts';")).toHaveLength(1);
  expect(checkFile('src/index.ts', "export * from './core/index.ts';")).toEqual([]);
  expect(checkFile('src/index.ts', "export { x } from './cli/manifest.ts';")).toEqual([]);
  expect(checkFile('src/index.ts', "export { x } from './cli/build.ts';")).toHaveLength(1);
  expect(checkFile('src/kinds/a.ts', "import { x } from '../index.ts';")).toHaveLength(1);
});
