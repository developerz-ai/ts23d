// Every number in a GLB's JSON chunk goes through the one rounding (core's `gltfText`, 9
// significant digits): node transforms, accessor bounds, material factors and extras such as a
// tread's pitch. No writer prints the seventeen digits of a float64.

import { expect, it } from 'bun:test';
import { compile, GLTF_ROUNDING, roundNumber } from '../core/index.ts';
import { packGlb as packImported } from '../neural/index.ts';
import { packGlb } from './container.ts';
import { toGlb } from './glb.ts';
import { beltTank, floats } from './tread-fixtures.ts';

/** The JSON chunk's text and every non-whole number literal in it. */
function jsonNumbers(glb: Uint8Array): { text: string; numbers: string[] } {
  const length = new DataView(glb.buffer, glb.byteOffset).getUint32(12, true);
  const text = new TextDecoder().decode(glb.subarray(20, 20 + length));
  return { text, numbers: text.match(/-?\d+\.\d+(?:e[-+]?\d+)?/g) ?? [] };
}
const digits = (n: string): number =>
  (n.split('e')[0] ?? '').replace(/^-?0*\.?0*/, '').replace('.', '').length;

it('both GLB containers round: 0.1 + 0.2 is written as 0.3, a whole number as itself', () => {
  const doc = { asset: { version: '2.0' }, extras: { pitch: 0.1 + 0.2, count: 4294967297 } };
  expect(JSON.stringify(doc)).toContain('0.30000000000000004'); // what an unrounded writer prints
  for (const glb of [packGlb(doc, new Uint8Array(4)), packImported(doc, new Uint8Array(4))]) {
    const { text } = jsonNumbers(glb);
    expect(text).toContain('"pitch":0.3,');
    expect(text).toContain('"count":4294967297');
  }
});

it('a tracked vehicle GLB has no number past 9 significant digits, and bounds still match', () => {
  const glb = toGlb(compile(beltTank(), { lod: 0 }), { animations: true });
  const { text, numbers } = jsonNumbers(glb);
  expect(numbers.length).toBeGreaterThan(50);
  expect(numbers.filter((n) => digits(n) > 9)).toEqual([]);
  // Accessor bounds are float32 values: nine digits read back to exactly the stored float.
  const json = JSON.parse(text) as {
    accessors: { type: string; min?: number[]; max?: number[]; componentType: number }[];
    meshes: { primitives: { attributes: { POSITION: number } }[] }[];
  };
  const bin = glb.subarray(20 + new DataView(glb.buffer, glb.byteOffset).getUint32(12, true) + 8);
  let checked = 0;
  for (const mesh of json.meshes)
    for (const p of mesh.primitives) {
      const acc = json.accessors[p.attributes.POSITION];
      const values = floats(json, bin, p.attributes.POSITION, 3);
      for (let k = 0; k < 3; k++) {
        let [lo, hi] = [Infinity, -Infinity];
        for (let i = k; i < values.length; i += 3) {
          lo = Math.min(lo, values[i] ?? 0);
          hi = Math.max(hi, values[i] ?? 0);
        }
        expect(Math.fround(acc?.min?.[k] ?? NaN)).toBe(lo);
        expect(Math.fround(acc?.max?.[k] ?? NaN)).toBe(hi);
        expect(acc?.min?.[k]).toBe(roundNumber(lo, GLTF_ROUNDING));
        checked++;
      }
    }
  expect(checked).toBeGreaterThan(5);
});
