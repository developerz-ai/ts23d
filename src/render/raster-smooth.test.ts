// The contact sheet interpolates per pixel what an engine interpolates (D450–D454): vertex colour,
// the smooth normal and the trim-sheet albedo under the pixel's own UV, so a vertex-colour ramp
// is a ramp, not two flat triangles; and glass shows what is behind it nearly unchanged face-on.

import { describe, expect, it } from 'bun:test';
import {
  type CompiledAsset,
  compile,
  defineAsset,
  type Mesh,
  type Surface,
} from '../core/index.ts';
import type { PaintedSheet } from '../material/index.ts';
import { drawAsset, orthoCamera, type Target } from './raster.ts';
import { sheetTones } from './sheet-tones.ts';

type Rgb = readonly [number, number, number];
const W = 64;

/** A 1 m quad facing +X at depth `x`: corner colours, normals and U (along +Y) per corner. */
function quad(o: {
  x?: number;
  colour?: (y: number) => Rgb;
  normal?: (y: number) => Rgb;
  u?: (y: number) => number;
  v?: number;
}): Mesh {
  const corners = [
    [-0.5, 0.5],
    [0.5, 0.5],
    [0.5, -0.5],
    [-0.5, -0.5],
  ] as const;
  return {
    positions: new Float32Array(corners.flatMap(([y, z]) => [o.x ?? 0, y, z])),
    normals: new Float32Array(corners.flatMap(([y]) => o.normal?.(y) ?? [1, 0, 0])),
    uvs: new Float32Array(corners.flatMap(([y]) => [o.u?.(y) ?? 0.5, o.v ?? 0.5 / 64])),
    colors: new Float32Array(corners.flatMap(([y]) => o.colour?.(y) ?? [1, 1, 1])),
    indices: new Uint32Array([0, 2, 1, 0, 3, 2]),
  };
}

const asset = (parts: readonly (readonly [string, Mesh, Surface?])[]): CompiledAsset =>
  compile(
    defineAsset({
      name: 'probe',
      kind: 'prop',
      budget: { triangles: [8, 8, 8] },
      build: (ctx) => {
        for (const [name, mesh, surface] of parts) ctx.part(name, mesh, surface ? { surface } : {});
      },
    }),
  );

/** Front view (+X toward the camera, +Y to the right) of `a`, W × W on an opaque grey backdrop. */
function front(a: CompiledAsset, sheet?: PaintedSheet): Uint8Array {
  const t: Target = {
    px: new Uint8Array(W * W * 4),
    depth: new Float32Array(W * W).fill(Infinity),
    width: W,
    height: W,
  };
  for (let k = 0; k < W * W; k++) t.px.set([238, 240, 243, 255], k * 4);
  const cam = orthoCamera({ label: 'f', dir: [-1, 0, 0], up: [0, 0, 1] }, [0, 0, 0], 1, W);
  drawAsset(t, cam, a, sheet ? sheetTones(sheet) : undefined);
  return t.px;
}

/** Channel `c` along the middle row, inside the quad (x 8…55). */
const row = (px: Uint8Array, c: number, y = W / 2): number[] =>
  Array.from({ length: 48 }, (_, i) => px[((y * W + 8 + i) << 2) + c] ?? 0);
const monotone = (v: readonly number[]): boolean =>
  v.every((x, i) => i === 0 || x >= (v[i - 1] ?? 0));
const distinct = (v: readonly number[]): number => new Set(v).size;

/** A size² sheet: strip row 0 a grey ramp repeating every 64 texels in U, every other texel white. */
function rampSheet(size: number): PaintedSheet {
  const albedo = new Uint8Array(size * size * 4).fill(255);
  const rows = size / 64;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < size; x++)
      albedo.fill(
        40 + Math.round((200 * (x % 64)) / 63),
        (y * size + x) * 4,
        (y * size + x) * 4 + 3,
      );
  const flat = new Uint8Array(size * size * 4).fill(255);
  return { size, albedo, normal: flat, orm: flat };
}
const white: PaintedSheet = {
  size: 4,
  albedo: new Uint8Array(64).fill(255),
  normal: new Uint8Array(64).fill(255),
  orm: new Uint8Array(64).fill(255),
};

describe('contact sheet per-pixel shading', () => {
  it('D450: a vertex-colour ramp over two triangles is a monotone per-pixel ramp', () => {
    const g = (y: number): Rgb => [0.1 + 0.8 * (y + 0.5), 0.1 + 0.8 * (y + 0.5), 0.1];
    for (const sheet of [undefined, white]) {
      const r = row(front(asset([['ramp', quad({ colour: g })]]), sheet), 0);
      expect(monotone(r)).toBe(true);
      expect(distinct(r)).toBeGreaterThan(30);
      // Off the diagonal too: the row a quarter down crosses the other triangle.
      const q = row(front(asset([['ramp', quad({ colour: g })]]), sheet), 0, W / 4);
      expect(monotone(q)).toBe(true);
      expect(distinct(q)).toBeGreaterThan(30);
    }
  });

  it('D451: smooth vertex normals shade per pixel, not one normal per triangle', () => {
    // Normals swing from facing the light (−Y side) to facing away (+Y side) across the quad.
    const n = (y: number): Rgb => [1, 1.2 * y, 0];
    const r = row(front(asset([['bent', quad({ normal: n })]])), 0);
    expect(distinct(r)).toBeGreaterThan(15);
    expect(r[0]).toBeGreaterThan((r[47] ?? 0) + 30);
  });

  it('D452: trim-sheet albedo is sampled per pixel under the interpolated UV', () => {
    // 512² like the preview sheet: strip rows are 8 texels; U spans one 64-texel ramp.
    const sheet = rampSheet(512);
    const r = row(front(asset([['strip', quad({ u: (y) => (y + 0.5) * 0.12 })]]), sheet), 0);
    expect(monotone(r)).toBe(true);
    expect(distinct(r)).toBeGreaterThan(12);
    expect((r[47] ?? 0) - (r[0] ?? 0)).toBeGreaterThan(60);
  });

  it('D452: the sample never bleeds into the next strip row', () => {
    // Strip row 0 is a ramp, row 1 white: a quad on row 0 must not pick up row 1's white.
    const sheet = rampSheet(512);
    const r = row(front(asset([['strip', quad({ u: () => 0.02, v: 0.99 / 64 })]]), sheet), 0);
    expect(Math.max(...r)).toBeLessThan(120);
  });

  it('D453: a glass quad in front of a red quad shows the red through it', () => {
    const red = (): Rgb => [0.9, 0.05, 0.05];
    const bare = front(asset([['red', quad({ x: -0.2, colour: red })]]), white);
    const glazed = front(
      asset([
        ['red', quad({ x: -0.2, colour: red })],
        ['pane', quad({ x: 0.2, colour: () => [0.6, 0.8, 0.9] }), 'glass'],
      ]),
      white,
    );
    const at = (px: Uint8Array, c: number): number => px[((W / 2) * W + W / 2) * 4 + c] ?? 0;
    // Face-on glass transmits most light: the red stays red, within a light tint.
    expect(at(glazed, 0)).toBeGreaterThan(at(bare, 0) * 0.8);
    expect(at(glazed, 1)).toBeLessThan(at(bare, 1) + 20);
    expect(at(glazed, 2)).toBeLessThan(at(bare, 2) + 20);
    // And the pane is still there: the pixels differ from the bare red.
    expect(row(glazed, 1)).not.toEqual(row(bare, 1));
  });

  it('D454: glass seen edge-on reflects (Fresnel): a glass ball rim differs from its centre', () => {
    // A strip of glass whose normals turn from facing the camera (centre) to grazing (edges).
    const n = (y: number): Rgb => [1 - 1.9 * Math.abs(y), 2 * y, 0];
    const px = front(
      asset([['ball', quad({ normal: n, colour: () => [0.9, 0.9, 0.9] }), 'glass']]),
      white,
    );
    const r = row(px, 0);
    const mid = r[24] ?? 0;
    // The backdrop shows through the middle almost unchanged; the grazing edge is darker.
    expect(Math.abs(mid - 238)).toBeLessThan(25);
    expect(Math.abs((r[0] ?? 0) - mid)).toBeGreaterThan(25);
  });

  it('is deterministic', () => {
    const g = (y: number): Rgb => [0.2 + 0.6 * (y + 0.5), 0.3, 0.4];
    const a = asset([
      ['ramp', quad({ colour: g, x: -0.1 })],
      ['pane', quad({ x: 0.2 }), 'glass'],
    ]);
    expect(Bun.hash(front(a, white))).toBe(Bun.hash(front(a, white)));
  });
});
