import { describe, expect, test } from 'bun:test';
import {
  type DemBox,
  decodeTerrarium,
  localToLonLat,
  lonLatToLocal,
  lonLatToPixel,
  resampleTerrarium,
  type TileImage,
  tilesFor,
} from './terrarium.ts';

/** A 256² tile whose every pixel encodes `h(px, py)` (global pixel coords) in terrarium RGB. */
function tile(tx: number, ty: number, h: (x: number, y: number) => number, size = 256): TileImage {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const v = h(tx * 256 + x, ty * 256 + y) + 32768;
      const k = (y * size + x) * 4;
      data[k] = Math.floor(v / 256);
      data[k + 1] = Math.floor(v) % 256;
      data[k + 2] = Math.round((v - Math.floor(v)) * 256);
      data[k + 3] = 255;
    }
  return { width: size, height: size, data };
}

const BOX: DemBox = {
  centre: { lat: 37.738, lon: -119.553 },
  size: [4000, 4000],
  cells: 16,
  zoom: 13,
};

describe('terrarium', () => {
  test('a tile of the wrong size refuses with T3D_DATA_DEM', () => {
    expect(() => resampleTerrarium(BOX, (x, y) => tile(x, y, () => 0, 128))).toThrow(
      'T3D_DATA_DEM',
    );
    expect(() => tilesFor({ ...BOX, zoom: 16 })).toThrow('T3D_DATA_DEM');
    expect(() => tilesFor({ ...BOX, cells: 1 })).toThrow('T3D_DATA_DEM');
  });

  test('decodes known pixels', () => {
    expect(decodeTerrarium(128, 0, 0)).toBe(0);
    // Half Dome, 2693 m: 32768 + 2693 = 35461 = 138·256 + 133.
    expect(decodeTerrarium(138, 133, 0)).toBe(2693);
    expect(decodeTerrarium(127, 255, 128)).toBe(-0.5);
  });

  test('Web-Mercator pixels and the local frame', () => {
    expect(lonLatToPixel(0, 0, 0)).toEqual([128, 128]);
    const [px, py] = lonLatToPixel(-119.553, 37.738, 13);
    expect(Math.floor(px / 256)).toBe(1375);
    expect(Math.floor(py / 256)).toBe(3167); // slippy-map tile y for 37.738° N at z13
    const [lon, lat] = localToLonLat(BOX.centre, 1744, 890);
    const [x, y] = lonLatToLocal(BOX.centre, lon, lat);
    expect(x).toBeCloseTo(1744, 6);
    expect(y).toBeCloseTo(890, 6);
    // 1 km north is 1/111.2 of a degree.
    expect(localToLonLat(BOX.centre, 0, 1000)[1] - 37.738).toBeCloseTo(0.0089932, 6);
  });

  test('resamples a planar field exactly, south row first', () => {
    const tiles = tilesFor(BOX);
    expect(tiles.length).toBeGreaterThan(0);
    const seen = new Set(tiles.map((t) => `${t.x}/${t.y}`));
    // Height rises 1 m per pixel to the east and falls 2 m per pixel to the south.
    const field = (x: number, y: number): number => 1000 + (x - 352000) - 2 * (y - 810000);
    const h = resampleTerrarium(BOX, (x, y) => {
      expect(seen.has(`${x}/${y}`)).toBe(true);
      return tile(x, y, field);
    });
    expect(h.length).toBe(17 * 17);
    const [x0, y0] = lonLatToPixel(...localToLonLat(BOX.centre, -2000, -2000), 13);
    expect(h[0]).toBeCloseTo(field(x0 - 0.5, y0 - 0.5), 1);
    expect(h[16 * 17] ?? 0).toBeGreaterThan(h[0] ?? 0); // north row higher
    expect(h[16] ?? 0).toBeGreaterThan(h[0] ?? 0); // east higher
  });
});
