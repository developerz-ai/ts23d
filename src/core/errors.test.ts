import { expect, it } from 'bun:test';
import { isTs23dError, Ts23dError } from './errors.ts';

/** The same class as loaded from a second copy of the library (`bunx -p` vs node_modules). */
class OtherCopyError extends Error {
  readonly code: string;
  readonly fix: string;
  constructor(code: string, details: { cause: string; fix: string }) {
    super(`${code}: ${details.cause}`);
    this.name = 'Ts23dError';
    this.code = code;
    this.fix = details.fix;
  }
  toJSON(): { code: string; message: string; fix: string } {
    return { code: this.code, message: this.message, fix: this.fix };
  }
}

it('rejects plain errors, look-alikes without a T3D_ code, and non-errors', () => {
  expect(isTs23dError(new Error('T3D_RECIPE_INVALID: x'))).toBe(false);
  expect(isTs23dError(new OtherCopyError('ENOENT', { cause: 'c', fix: 'f' }))).toBe(false);
  const renamed = new OtherCopyError('T3D_RECIPE_INVALID', { cause: 'c', fix: 'f' });
  renamed.name = 'TypeError';
  expect(isTs23dError(renamed)).toBe(false);
  expect(isTs23dError({ name: 'Ts23dError', code: 'T3D_X', fix: 'f', toJSON: () => ({}) })).toBe(
    false,
  );
  expect(isTs23dError(undefined)).toBe(false);
  expect(isTs23dError('T3D_RECIPE_INVALID')).toBe(false);
});

it('accepts this copy and a structurally identical error from another copy', () => {
  const ours = new Ts23dError('T3D_RECIPE_INVALID', { cause: 'c', fix: 'f' });
  const theirs = new OtherCopyError('T3D_RECIPE_INVALID', { cause: 'c', fix: 'f' });
  expect(theirs instanceof Ts23dError).toBe(false);
  expect(isTs23dError(ours)).toBe(true);
  expect(isTs23dError(theirs)).toBe(true);
});
