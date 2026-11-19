import { expect, it } from 'bun:test';
import { ALLOWED, checkSource, isAllowed } from './determinism.ts';

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
