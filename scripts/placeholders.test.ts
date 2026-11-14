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
  ])
    expect(checkSource('a.ts', line)).toEqual([]);
});
