import { expect, it } from 'bun:test';
import {
  ALLOWED,
  checkSource,
  codeLines,
  codeOnly,
  isAllowed,
  LIBM_ALLOWED,
  LIBM_ROOTS,
  underLibmRule,
} from './determinism.ts';

it('refuses ambient entropy and ignores comments', () => {
  expect(checkSource('a.ts', 'const x = Math.random();')).toHaveLength(1);
  expect(checkSource('a.ts', 'const t = Date.now();')).toHaveLength(1);
  expect(checkSource('a.ts', '// Math.random() is banned')).toEqual([]);
  expect(checkSource('a.ts', 'const r = ctx.rng.next();')).toEqual([]);
});

it('refuses locale-dependent ordering and every other entropy source', () => {
  for (const line of [
    'names.sort((a, b) => a.localeCompare(b));',
    "const f = new Intl.NumberFormat('en');",
    'crypto.getRandomValues(buf);',
    'const idat = deflateSync(raw);',
    'const z = Bun.gzipSync(bytes);',
    'const id = crypto.randomUUID();',
    'const stamp = Date();',
    'const t = process.hrtime.bigint();',
    "const x = Math['random']();",
    'const y = Math["random"]();',
    'const { random } = Math;',
    'const roll = Math.random;',
    'const { floor, random: r } = Math;',
    'const t = new Date();',
    'const s = n.toLocaleString();',
    'const p = performance.now();',
  ])
    expect(checkSource('a.ts', line)).toHaveLength(1);
});

it('ignores trailing comments but not code after a // inside a string', () => {
  expect(checkSource('a.ts', 'const r = ctx.rng.next(); // never Math.random()')).toEqual([]);
  expect(checkSource('a.ts', "const u = 'https://x.dev'; const t = Date.now();")).toHaveLength(1);
  expect(checkSource('a.ts', 'const u = `http://x.dev/` + Math.random();')).toHaveLength(1);
});

it('allows deterministic look-alikes', () => {
  for (const line of [
    'const { floor, sin } = Math;',
    "fix: 'read ctx.rng only: no Math.random, Date, or module-level counters',",
    'const d = validDate(x);',
    'const updated: Date = input.date;',
    'const s = a < b ? -1 : a > b ? 1 : 0;',
  ])
    expect(checkSource('a.ts', line)).toEqual([]);
});

it('exempts only the listed paths, each with a reason', () => {
  expect(isAllowed('src/neural/blender-session.ts')).toBe(false);
  expect(isAllowed('src/client/a.ts')).toBe(false);
  expect(isAllowed('recipes/t34/t34.ts')).toBe(false);
  expect(isAllowed('src/cli/build.ts')).toBe(true);
  expect(isAllowed('src/neural/blender-session-process.ts')).toBe(true);
  for (const a of ALLOWED) expect(a.why.length).toBeGreaterThan(20);
});

const LIBM_LINES = [
  'const s = Math.sin(a);',
  'const c = r * Math.cos(2 * Math.PI * u);',
  'const e = Math.exp(-d * d);',
  'const l = Math.hypot(x, y, z) || 1;',
  'const g = Math.pow(v, 2.4);',
  'const t = Math.atan2(y, x) + Math . log2(n);',
  'const g = ((v + 0.055) / 1.055) ** 2.4;',
  'const f = (1 - c) ** 5;',
  'x **= 2;',
  'const { sin, cos } = Math;',
  'const { floor, hypot: len } = Math;',
  "const s = Math['sin'](a);",
  'const m = Math;',
  'const h = Math.sinh(x) + Math.acosh(y) + Math.log1p(z);',
  'const d = Math.log10(n) + Math.cbrt(v) + Math.expm1(w);',
];

it('refuses the platform libm and ** in everything that feeds an asset, and names dmath', () => {
  for (const file of [
    'src/render/path/sky.ts',
    'src/primitives/box.ts',
    'src/kinds/gait.test.ts',
    'src/cli/build-one.ts',
    'recipes/t34/t34.ts',
    'recipes/_lib/finish/afv.test.ts',
    'apps/site/src/viewer.ts',
    'examples/build-with-bun.ts',
  ]) {
    for (const line of LIBM_LINES) {
      const found = checkSource(file, line);
      expect([file, line, found.length]).toEqual([file, line, 1]);
      expect(found[0]?.fix).toContain('dmath');
    }
    expect(checkSource(file, 'const s = Math.sin(a) ** 2;')).toHaveLength(2);
  }
});

it('refuses a libm spelling split across lines, on the line it starts', () => {
  const split = [
    ['const s = Math\n  .sin(x);', 1],
    ['const a = 1;\nconst s = Math.\n  sin(x);', 2],
    ['const {\n  floor,\n  sin,\n} = Math;', 1],
    ['const a = 1;\nconst {\n  hypot: len,\n} =\n  Math;', 2],
    ["const s = Math[\n  'sin'\n](x);", 1],
  ] as const;
  for (const [source, line] of split) {
    const found = checkSource('src/passes/weld.ts', source);
    expect([source, found.map((v) => v.line)]).toEqual([source, [line]]);
  }
  // Two rules on one line, and the same rule on two lines, are each reported.
  expect(
    checkSource('src/a.ts', 'const s = Math.sin(a) ** 2;\nconst c = Math.cos(b);'),
  ).toHaveLength(3);
  expect(checkSource('src/a.ts', 'const {\n  floor,\n  sqrt,\n} = Math;')).toEqual([]);
});

it('leaves exact maths, dmath, strings and comments alone', () => {
  for (const line of [
    'const l = Math.sqrt(x * x + y * y) + Math.abs(z) + Math.fround(w);',
    'const n = Math.floor(a) + Math.round(b) + Math.min(c, Math.max(d, Math.PI));',
    'const s = dmath.sin(a) * dmath.pow(v, 2.4) + dmath.hypot(x, y) + dmath.norm(v);',
    "const tip = '**Floating bits** — every bar touches what holds it';",
    'const md = `- **code**: ` + w.message;',
    '/** Schlick: (1 - c) ** 5, like Math.pow. */',
    '/**\n * the lobe falls off as cos ** n\n * like Math.pow\n */\nconst a = 1;',
    'const a = b * c; // was b ** 2 with Math.sin',
    'const a = b /* b ** 2 */ * c;',
    'const { floor, sqrt } = Math;',
    'const v = Math.imul(h, 16777619) + Math.sign(x) + Math.trunc(y) + Math.ceil(z);',
    'const k = 4294967296 /* 2^32 */;',
  ])
    for (const file of ['src/render/brdf.ts', 'src/passes/weld.ts', 'recipes/wolf/wolf.ts'])
      expect([line, checkSource(file, line)]).toEqual([line, []]);
});

/** The two characters that open a template placeholder, kept out of this file's own strings. */
const OPEN = ['$', '{'].join('');

it('a template literal over many lines is text; the code in its placeholders is checked', () => {
  const python = [
    'const script = `',
    'import numpy as np',
    "d = np.sqrt((X - tx) ** 2 + (Y - ty) ** 2)  # it's Math.sin-free",
    '`;',
    'const after = 1;',
  ].join('\n');
  expect(checkSource('recipes/bear_hybrid/steps.ts', python)).toEqual([]);
  const live = `const md = \`**bold**\narea ${OPEN}(r ** 2 * Math.PI).toFixed(2)} m²\n\`;`;
  expect(checkSource('src/qa/report.ts', live).map((v) => v.line)).toEqual([2]);
  const nested = `const t = \`a ${OPEN}f({ k: \`b ${OPEN}x}\` })} ** c\`; const y = Math.cos(1);`;
  expect(checkSource('src/qa/report.ts', nested)).toHaveLength(1);
  const afterwards = `${python}\nconst z = Math.exp(1);`;
  expect(checkSource('recipes/bear_hybrid/steps.ts', afterwards).map((v) => v.line)).toEqual([6]);
});

it('checks nothing outside its roots and exempts only the listed files, each with a reason', () => {
  expect(checkSource('scripts/bench.ts', 'const s = Math.sin(a) ** 2;')).toEqual([]);
  expect(checkSource('apps/site/vite.config.ts', 'const s = Math.cos(a);')).toEqual([]);
  expect(underLibmRule('src/renderer/x.ts')).toBe(true);
  expect(underLibmRule('src/core/dmath-trig.ts')).toBe(true);
  expect(LIBM_ROOTS).toEqual(['src/', 'recipes/', 'apps/site/src/', 'examples/']);
  for (const a of LIBM_ALLOWED) {
    expect(underLibmRule(a.path)).toBe(false);
    expect(checkSource(a.path, 'const s = Math.sin(a) ** 2;')).toEqual([]);
    expect(a.path.endsWith('.test.ts')).toBe(true); // nothing that ships is exempt
    expect(a.why.length).toBeGreaterThan(20);
  }
});

it('codeOnly empties strings and drops comments, keeping the code around them', () => {
  expect(codeOnly("f('a ** b', x ** 2) // c ** d")).toBe("f('', x ** 2) ");
  expect(codeOnly('const s = `it\\`s ** x` + y;')).toBe('const s = `` + y;');
  expect(codeLines('a /* x\n ** y\n */ b')).toEqual(['a ', '', ' b']);
  expect(codeLines("const q = 'unclosed\nconst r = 2 ** 3;")[1]).toBe('const r = 2 ** 3;');
});
