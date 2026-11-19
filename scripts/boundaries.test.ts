import { expect, it } from 'bun:test';
import { checkFile, codeOnly } from './boundaries.ts';

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

it('ignores imports written in comments and inside strings, and still sees the code around them', () => {
  const quiet = [
    "// import '../qa/index.ts';",
    "/* import { x } from '../qa/index.ts'; */",
    "/**\n * e.g. `import { x } from '../qa/index.ts'`\n */",
    'const fix = "write import { x } from \'../qa/index.ts\'";',
    "const fix = `import('../qa/index.ts')`;",
    "const url = 'http://x'; // from '../qa/index.ts'",
  ];
  for (const source of quiet) expect(checkFile('src/core/a.ts', source)).toEqual([]);
  // A comment marker inside a string, or a quote inside a comment, hides nothing after it.
  const loud = [
    "const a = '//'; import { x } from '../qa/index.ts';",
    "// don't\nimport { x } from '../qa/index.ts';",
    "const a = '/*'; import '../qa/index.ts'; const b = '*/';",
    // Code inside a template's placeholder ('$' apart, so this stays a plain string here).
    `const s = \`$${"{await import('../qa/index.ts')}"}\`;`,
    "import { x } /* why */ from /* here */ '../qa/index.ts';",
  ];
  for (const source of loud) expect(checkFile('src/core/a.ts', source)).toHaveLength(1);
  expect(checkFile('src/core/a.ts', "/* a\n b */\n\nimport '../qa/index.ts';")).toEqual([
    expect.objectContaining({ line: 4 }),
  ]);
});

it('ends a line comment at its line break, also after a trailing backslash', () => {
  // `\` continues nothing in a `//` comment: the next line is code.
  const source = "// C:\\tmp\\\nimport { x } from '../qa/index.ts';";
  expect(checkFile('src/core/a.ts', source)).toEqual([expect.objectContaining({ line: 2 })]);
  expect(codeOnly('// a\\\nb')).toBe('     \nb');
  expect(codeOnly('// a\\')).toBe('     ');
});
