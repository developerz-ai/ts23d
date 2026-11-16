import { describe, expect, test } from 'bun:test';
import { Ts23dError } from '../core/index.ts';
import { parseConceptArgs } from './concept-cli.ts';

describe('parseConceptArgs', () => {
  test('rejects a bad --variants and an unknown flag with T3D_CLI_USAGE', () => {
    for (const argv of [
      ['a.ts', '--variants', '0'],
      ['a.ts', '--variants', 'x'],
      ['a.ts', '--nope'],
    ]) {
      let err: unknown;
      try {
        parseConceptArgs(argv);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(Ts23dError);
      expect((err as Ts23dError).code).toBe('T3D_CLI_USAGE');
    }
  });

  test('collects files, variants and out', () => {
    expect(parseConceptArgs(['a.ts', '--variants', '6', '--out', 'c', '--json', 'b.md'])).toEqual({
      files: ['a.ts', 'b.md'],
      variants: 6,
      out: 'c',
    });
  });
});
