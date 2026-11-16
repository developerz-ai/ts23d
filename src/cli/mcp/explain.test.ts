import { expect, it } from 'bun:test';
import { Ts23dError } from '../../core/index.ts';
import { errorsDoc, explain, explainIn } from './explain.ts';

const codeOf = async (p: Promise<unknown>): Promise<string | undefined> =>
  p.then(
    () => undefined,
    (e: unknown) => (e instanceof Ts23dError ? e.code : 'other'),
  );

it('refuses a malformed or undocumented code with a fix', async () => {
  expect(await codeOf(explain('rm -rf'))).toBe('T3D_CLI_USAGE');
  expect(await codeOf(explain('T3D_NO_SUCH_CODE'))).toBe('T3D_CLI_USAGE');
});

it('fails with a code when no errors doc sits above the start directory', async () => {
  expect(await codeOf(errorsDoc('/'))).toBe('T3D_RECIPE_NOT_FOUND');
});

it('reads cause and fix from the shipped errors doc', async () => {
  const [row] = await explain('T3D_PART_UNKNOWN');
  expect(row?.section).toBe('Library codes');
  expect(row?.columns['Fix']).toContain('parent');
  expect(row?.columns['Cause']).toBeDefined();
});

it('names columns by each table header', () => {
  const doc = [
    '## A',
    '| Code | Cause | Fix |',
    '|---|---|---|',
    '| `T3D_X` | it broke | mend it |',
    '',
    '### B',
    '| Code | Assertion | Cause |',
    '|---|---|---|',
    '| `T3D_X` | assertX | again |',
  ].join('\n');
  expect(explainIn(doc, 'T3D_X')).toEqual([
    { code: 'T3D_X', section: 'A', columns: { Cause: 'it broke', Fix: 'mend it' } },
    { code: 'T3D_X', section: 'B', columns: { Assertion: 'assertX', Cause: 'again' } },
  ]);
  expect(explainIn(doc, 'T3D_Y')).toEqual([]);
});
