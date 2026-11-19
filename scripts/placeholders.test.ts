import { expect, it } from 'bun:test';
import { checkSource } from './placeholders.ts';

it('refuses elided and stubbed code', () => {
  for (const line of [
    '  // ...',
    'function f() { /* … */ }',
    '// ... rest of code',
    '// rest of the code unchanged',
    '// implement this',
    '// same as above for the other wheels',
    '// similar for the remaining axles',
    '// TODO: implement',
    '// omitted for brevity',
    '// ... existing code ...',
    '  // … unchanged …',
    '// rest of the function stays the same',
    '// rest of function unchanged',
    '// TODO: fill in',
    '// TODO write the solver',
    '// remaining cases omitted',
    '// existing code',
    '// unchanged',
    '/* existing methods unchanged */',
    'const a = 1; // ...',
    '/* ... existing methods ... */',
    '{/* ... */}',
  ])
    expect(checkSource('a.ts', line)).toHaveLength(1);
});

it('reports file, line and a fix', () => {
  expect(checkSource('r.ts', 'const a = 1;\n// ...')).toEqual([
    {
      file: 'r.ts',
      line: 2,
      message: 'elided code comment',
      fix: expect.stringContaining('notImplemented()'),
    },
  ]);
});

it('allows spreads, rest params and planned stubs', () => {
  for (const line of [
    'const parts = [...a, ...b];',
    'function f(...args: number[]) {}',
    "throw notImplemented('sweep', 'M1');",
    '// …and the track belts run round them at the same speed',
    '// ...then take exactly the faces it sees',
    '// TODO(#12): tune the boiler taper once refs land',
    'const [head, ...rest] = parts; // rest of the chain hangs off head',
    '// the rest of the hull stays below the deck line',
    '// leaves the existing code path for LOD2 alone',
    '// values are unchanged when the seed is 0',
    "const label = 'loading...';",
    '// the remaining wheels share the axle',
  ])
    expect(checkSource('a.ts', line)).toEqual([]);
});
