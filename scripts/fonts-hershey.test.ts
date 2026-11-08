import { describe, expect, it } from 'bun:test';
import { Ts23dError } from '../src/core/index.ts';
import { FACES, fontModule, parseJhf } from './fonts-hershey.ts';

const rec = (id: number, body: string): string =>
  `${String(id).padStart(5, ' ')}${String(body.length / 2).padStart(3, ' ')}${body}`;
const file = (bodies: readonly string[]): string => bodies.map((b, k) => rec(k + 1, b)).join('\n');
const ascii = Array.from({ length: 95 }, (_, k) => (k === 0 ? 'JZ' : 'MWRFRT RRYQZR[SZRY'));

describe('fonts-hershey', () => {
  it('refuses a truncated record, a missing count and a wrong glyph total with a fix', () => {
    const cut = `${file(ascii.slice(0, 94))}\n12345 20MWRF`;
    const e = (() => {
      try {
        parseJhf(cut);
      } catch (x) {
        return x;
      }
    })();
    expect(e).toBeInstanceOf(Ts23dError);
    expect((e as Ts23dError).fix).toContain('download');
    expect(() => parseJhf('hello world')).toThrow(Ts23dError);
    expect(() => parseJhf(file(ascii.slice(0, 10)))).toThrow(/95/);
  });

  it('parses one record per glyph and joins records wrapped over lines', () => {
    const wrapped = file(ascii).replace('MWRFRT RRYQZR[SZRY', 'MWRFRT RR\nYQZR[SZRY');
    const g = parseJhf(wrapped);
    expect(g).toHaveLength(95);
    expect(g[0]).toBe('JZ');
    expect(g[1]).toBe('MWRFRT RRYQZR[SZRY');
  });

  it('emits a module carrying the Hershey acknowledgements, deterministically', () => {
    const face = FACES[0] ?? { font: 'x', constant: 'X', file: 'x', title: 'X' };
    const m = fontModule(face, ascii);
    expect(m).toContain('Dr. A. V. Hershey');
    expect(m).toContain('James Hurt');
    expect(m).toContain(`export const ${face.constant}: readonly string[] = [`);
    expect(m).toContain('"JZ", // " "');
    expect(fontModule(face, ascii)).toBe(m);
  });
});
