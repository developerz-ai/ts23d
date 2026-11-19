// conventions-brand: `instanceof Ts23dError` is false for an error from another loaded copy of the
// library, so outside core it is refused in favour of the brand check `isTs23dError`.

import { describe, expect, it } from 'bun:test';
import { brandChecks } from './conventions-brand.ts';

const src = (file: string, text: string) => ({ file, text });

describe('brandChecks', () => {
  it('fails `instanceof Ts23dError` in src/ and scripts/ with the line and an isTs23dError fix', () => {
    const v = brandChecks(
      [
        src('src/a.ts', '// ok\nif (!(e instanceof Ts23dError)) throw e;'),
        src('scripts/b.ts', 'return e instanceof Ts23dError ? 1 : 0;'),
      ],
      {},
    );
    expect(v.map((x) => [x.file, x.line])).toEqual([
      ['src/a.ts', 2],
      ['scripts/b.ts', 1],
    ]);
    expect(v[0]?.fix).toContain('isTs23dError(e)');
  });

  it('passes the brand check itself, comments and the core definition', () => {
    expect(
      brandChecks(
        [
          src(
            'src/a.ts',
            '// e instanceof Ts23dError is false across copies\nif (isTs23dError(e)) x();',
          ),
          src('src/core/errors.ts', 'if (e instanceof Ts23dError) return true;'),
        ],
        {},
      ),
    ).toEqual([]);
  });

  it('excuses an allowlisted file and flags the entry once nothing is left to excuse', () => {
    const allow = { 'src/qa/x.ts': 'owner: someone' };
    const bad = src('src/qa/x.ts', 'if (e instanceof Ts23dError) throw e;');
    expect(brandChecks([bad], allow)).toEqual([]);
    const fixed = brandChecks([src('src/qa/x.ts', 'if (isTs23dError(e)) throw e;')], allow);
    expect(fixed.map((x) => x.message)).toEqual([
      'stale PENDING_BRAND entry src/qa/x.ts (owner: someone): it has no `instanceof Ts23dError` left',
    ]);
  });
});
