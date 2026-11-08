import { describe, expect, it } from 'bun:test';
import { MATERIAL_STRIPS, type MaterialStripId } from '../trim-sheet.ts';
import { type Canvas, createCanvas } from './canvas.ts';
import { HOUSE_STRIPS } from './default-sheet.ts';
import { sobelNormals } from './normal.ts';
import { curvature } from './relief.ts';
import { paintStrip } from './strip.ts';
import type { StripRecipe } from './types.ts';

// A quarter-metre slice of each strip at the 2048² sheet's texel density (≈1 mm along U,
// scaleMetres / 64 along V): the same relief the shipped sheet carries, painted 4× faster.
function paint(id: MaterialStripId, relief: boolean): { c: Canvas; n: Uint8Array } {
  const base = HOUSE_STRIPS[id] as StripRecipe;
  const r: StripRecipe = relief
    ? base
    : { ...base, params: { ...base.params, relief: 0, grain: 0, cavity: 0, cavityRough: 0 } };
  const c = createCanvas(512, 64, 0.5, r.scaleMetres, true);
  paintStrip(c, r, 4242);
  return { c, n: sobelNormals(c) };
}

/** Mean tilt of the encoded normals, degrees. */
function tilt(n: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < n.length; i += 4)
    s += Math.hypot(((n[i] ?? 0) - 127.5) / 127.5, ((n[i + 1] ?? 0) - 127.5) / 127.5);
  return (Math.asin(s / (n.length / 4)) * 180) / Math.PI;
}

/** Minimum mean tilt per strip: deep relief, fine relief, and near-flat finishes. */
const FLOOR: Readonly<Record<MaterialStripId, number>> = {
  oak: 2.8,
  pine: 2.8,
  wood_weathered: 4,
  wood_painted: 2,
  iron_rust: 2.2,
  iron_cast: 2.2,
  canvas: 2.2,
  leather: 2.2,
  steel_galvanised: 0.6,
  aluminium: 0.7,
  brass: 0.55,
  copper: 0.5,
  rubber: 0.7,
  steel_painted: 0.38,
  chrome: 0.36,
  plastic: 0.36,
};

const painted = new Map(
  MATERIAL_STRIPS.map((id) => [id, { on: paint(id, true), off: paint(id, false) }] as const),
);
const get = (id: MaterialStripId) =>
  painted.get(id) ?? { on: paint(id, true), off: paint(id, false) };

describe('library strip relief (height-first)', () => {
  it('turning the relief params off flattens every strip (they carry the normal map)', () => {
    for (const id of MATERIAL_STRIPS) {
      const { on, off } = get(id);
      expect({ id, ratio: tilt(on.n) / tilt(off.n) > 1.2 }).toEqual({ id, ratio: true });
    }
  });

  it('every strip reaches its relief floor', () => {
    for (const id of MATERIAL_STRIPS)
      expect({ id, ok: tilt(get(id).on.n) >= FLOOR[id] }).toEqual({ id, ok: true });
  });

  it('height-derived normals are unit length and point out of the surface', () => {
    for (const id of MATERIAL_STRIPS) {
      const { n } = get(id).on;
      let bad = 0;
      for (let i = 0; i < n.length; i += 4) {
        const [x, y, z] = [n[i], n[i + 1], n[i + 2]].map((b) => ((b ?? 0) / 255) * 2 - 1);
        const len = Math.hypot(x ?? 0, y ?? 0, z ?? 0);
        if (Math.abs(len - 1) > 0.02 || (z ?? 0) <= 0) bad++;
      }
      expect({ id, bad }).toEqual({ id, bad: 0 });
    }
  });

  it('cavities are darker and rougher than raised spots (AO and roughness agree with height)', () => {
    for (const id of ['oak', 'iron_rust', 'iron_cast', 'leather', 'canvas', 'rubber'] as const) {
      const { c } = get(id).on;
      const k = curvature(c, 0.006);
      const order = [...k.keys()].sort((a, b) => (k[a] ?? 0) - (k[b] ?? 0));
      const tail = Math.floor(order.length * 0.05);
      const mean = (a: Float32Array, idx: number[]) =>
        idx.reduce((s, i) => s + (a[i] ?? 0), 0) / idx.length;
      const pits = order.slice(0, tail);
      const peaks = order.slice(-tail);
      expect({ id, ao: mean(c.occl, pits) < mean(c.occl, peaks) - 0.05 }).toEqual({ id, ao: true });
      expect({ id, rough: mean(c.rough, pits) > mean(c.rough, peaks) }).toEqual({
        id,
        rough: true,
      });
    }
  });
});
