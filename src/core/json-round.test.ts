import { expect, it } from 'bun:test';
import {
  GLTF_ROUNDING,
  gltfText,
  MANIFEST_ROUNDING,
  roundJson,
  roundNumber,
} from './json-round.ts';

it('drops the float64 noise digits: a last-bit difference prints the same', () => {
  const a = 0.1 + 0.2; // 0.30000000000000004
  const b = 0.3;
  expect(JSON.stringify(a)).not.toBe(JSON.stringify(b)); // unrounded, one ulp is two texts
  expect(roundNumber(a, GLTF_ROUNDING)).toBe(roundNumber(b, GLTF_ROUNDING));
  expect(roundNumber(a, MANIFEST_ROUNDING)).toBe(0.3);
  expect(roundNumber(5.920000076293945, MANIFEST_ROUNDING)).toBe(5.92);
  expect(roundNumber(123.45678949, MANIFEST_ROUNDING)).toBe(123.456789);
  expect(roundNumber(-0.00000049, MANIFEST_ROUNDING)).toBe(-0);
});

it('nine significant digits carry a float32 exactly, small and large', () => {
  let s = 7;
  for (let i = 0; i < 20000; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const scale = [1e-12, 1e-5, 1, 300, 1e9][i % 5] ?? 1;
    const f = Math.fround(((s / 4294967296) * 2 - 1) * scale);
    expect(Math.fround(roundNumber(f, GLTF_ROUNDING))).toBe(f);
  }
  expect(Math.fround(roundNumber(Math.fround(1 / 3), { significant: 6 }))).not.toBe(
    Math.fround(1 / 3),
  );
});

it('leaves whole numbers, non-numbers and non-finite values alone', () => {
  for (const v of [0, -0, 1, -17, 4294967296, 9007199254740991, Infinity, -Infinity])
    expect(Object.is(roundNumber(v, GLTF_ROUNDING), v)).toBe(true);
  expect(roundNumber(NaN, MANIFEST_ROUNDING)).toBeNaN();
  const doc = { name: 'a', n: 3, list: [1.23456789012, { deep: 2 / 3, keep: null, on: true }] };
  expect(roundJson(doc, MANIFEST_ROUNDING)).toEqual({
    name: 'a',
    n: 3,
    list: [1.234568, { deep: 0.666667, keep: null, on: true }],
  });
  expect(doc.list[0]).toBe(1.23456789012); // a copy: the input is not edited
});

it('gltfText writes every number of a glTF document at 9 significant digits, whole ones as they are', () => {
  const doc = {
    asset: { version: '2.0' },
    accessors: [
      { count: 4294967296, min: [1 / 3, -2 / 3, 0.1 + 0.2], max: [7, 1e-7 / 3, 12345.678901234] },
    ],
    nodes: [{ name: 'hull', translation: [0, -0, 1.5] }],
  };
  const text = gltfText(doc);
  expect(text).not.toBe(JSON.stringify(doc)); // unrounded, the float64 noise digits are written
  // Every fraction written (whole numbers aside) has at most 9 significant digits.
  for (const m of text.match(/-?\d+\.\d+(?:e-?\d+)?/g) ?? [])
    expect([m, m.replace(/^-|e.*$|\./g, '').replace(/^0+/, '').length <= 9]).toEqual([m, true]);
  const back = JSON.parse(text);
  expect(back.accessors[0].min).toEqual([0.333333333, -0.666666667, 0.3]);
  expect(back.accessors[0].max).toEqual([7, 3.33333333e-8, 12345.6789]);
  expect(back.accessors[0].count).toBe(4294967296);
  expect(back.nodes[0]).toEqual({ name: 'hull', translation: [0, 0, 1.5] });
});
