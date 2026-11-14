import { describe, expect, test } from 'bun:test';
import {
  type Box,
  clearMessage,
  endInMessage,
  hasWebGl,
  type LoadingParts,
  noWebGlLine,
} from './viewer-fallback.ts';

/** An element stand-in that remembers its classes. */
const box = (text = ''): Box & { readonly classes: Set<string> } => {
  const classes = new Set<string>();
  return {
    hidden: false,
    textContent: text,
    classes,
    classList: {
      add: (...t: string[]) => {
        for (const c of t) classes.add(c);
      },
      remove: (...t: string[]) => {
        for (const c of t) classes.delete(c);
      },
    },
  };
};

const overlay = () => {
  const parts = { root: box(), text: box('Compiling…'), bar: box(), time: box('3.1 s') };
  parts.root.hidden = true;
  return parts;
};

describe('hasWebGl', () => {
  test('getContext returning null for every id means no WebGL, without throwing', () => {
    const asked: string[] = [];
    const canvas = {
      getContext: (id: string) => {
        asked.push(id);
        return null;
      },
    };
    expect(hasWebGl(() => canvas)).toBe(false);
    expect(asked).toEqual(['webgl2', 'webgl']);
  });

  test('a canvas whose getContext throws counts as no WebGL', () => {
    const canvas = {
      getContext: (): unknown => {
        throw new Error('blocked');
      },
    };
    expect(hasWebGl(() => canvas)).toBe(false);
  });

  test('a WebGL1-only browser has WebGL', () => {
    expect(hasWebGl(() => ({ getContext: (id: string) => (id === 'webgl' ? {} : null) }))).toBe(
      true,
    );
  });
});

describe('endInMessage', () => {
  test('the fallback message is shown, the bar and timer go', () => {
    const parts = overlay();
    const line = noWebGlLine('tiger_1', true);
    endInMessage(parts, line);
    expect(parts.root.hidden).toBe(false);
    expect(parts.root.classes.has('failed')).toBe(true);
    expect(parts.text.textContent).toBe(line);
    expect(parts.bar.hidden).toBe(true);
    expect(parts.time.textContent).toBe('');
  });

  test('a missing text line or bar does not throw', () => {
    const parts: LoadingParts = { root: box(), text: null, bar: null, time: null };
    expect(() => endInMessage(parts, 'x')).not.toThrow();
  });

  test('clearMessage restores the progress look', () => {
    const parts = overlay();
    endInMessage(parts, 'x');
    clearMessage(parts);
    expect(parts.root.classes.has('failed')).toBe(false);
    expect(parts.bar.hidden).toBe(false);
  });
});

describe('noWebGlLine', () => {
  test('names the asset and says whether a render stands in for it', () => {
    expect(noWebGlLine('dragon', true)).toContain('committed render');
    expect(noWebGlLine('dragon', false)).toContain('no committed render');
    expect(noWebGlLine('dragon', false)).toContain('dragon');
  });
});
