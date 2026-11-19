import { describe, expect, test } from 'bun:test';
import { type AnchorTarget, decodeHash, keepsView, toAnchor } from './route.ts';

describe('decodeHash', () => {
  test('a malformed escape never throws: it comes back as written', () => {
    expect(() => decodeURIComponent('%E0')).toThrow();
    expect(decodeHash('#%E0')).toBe('%E0');
    expect(decodeHash('#100%')).toBe('100%');
  });

  test('a well-formed hash is decoded, with or without its #', () => {
    expect(decodeHash('#tiger_1')).toBe('tiger_1');
    expect(decodeHash('ranger%40cpu')).toBe('ranger@cpu');
    expect(decodeHash('')).toBe('');
    expect(decodeHash('#')).toBe('');
  });
});

describe('keepsView', () => {
  test('"Skip to content" on an asset page stays on the asset page', () => {
    expect(keepsView('page', true)).toBe(true);
  });

  test('a home section, an unknown name, or any anchor on home is a normal route', () => {
    expect(keepsView('home', true)).toBe(false);
    expect(keepsView(null, true)).toBe(false);
    expect(keepsView('page', false)).toBe(false);
  });
});

describe('toAnchor', () => {
  const target = (focusable: boolean) => {
    const calls: string[] = [];
    const el: AnchorTarget = {
      scrollIntoView: () => calls.push('scroll'),
      hasAttribute: () => focusable,
      focus: () => calls.push('focus'),
    };
    return { el, calls };
  };

  test('a re-route that is not a navigation leaves the scroll position and focus alone', () => {
    const { el, calls } = target(true);
    toAnchor(el, false);
    expect(calls).toEqual([]);
  });

  test('a navigation scrolls to the anchor and focuses it when it can take focus', () => {
    const main = target(true);
    toAnchor(main.el, true);
    expect(main.calls).toEqual(['scroll', 'focus']);
    const section = target(false);
    toAnchor(section.el, true);
    expect(section.calls).toEqual(['scroll']);
    expect(() => toAnchor(null, true)).not.toThrow();
  });
});
