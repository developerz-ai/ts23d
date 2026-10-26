import { beforeAll, describe, expect, it } from 'bun:test';
import { encodePng, Ts23dError } from '../core/index.ts';
import { DEFAULT_SHEET, type PaintedSheet, paintTrimSheet } from './generator.ts';
import { decodePng } from './paint/decode-png.ts';
import { CELLS, cellRect, FOLIAGE_CELLS, STRIPS, stripRect } from './trim-sheet.ts';

const SIZE = 512;
let sheet: PaintedSheet;
beforeAll(() => {
  sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: SIZE });
});

const px = (map: Uint8Array, x: number, y: number, k = 0): number =>
  map[(y * SIZE + x) * 4 + k] ?? -1;

function invalid(fn: () => unknown): Ts23dError {
  try {
    fn();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('expected a Ts23dError');
}

describe('paintTrimSheet: bad input', () => {
  it('rejects a size that is not 512/1024/2048, with a fix', () => {
    const e = invalid(() => paintTrimSheet({ ...DEFAULT_SHEET, size: 300 as 512 }));
    expect(e.code).toBe('T3D_RECIPE_INVALID');
    expect(e.fix).toContain('512, 1024 or 2048');
  });
  it('rejects a non-positive scaleMetres and an out-of-range roughness', () => {
    const flat = { kind: 'flat', roughness: 0.5 } as const;
    expect(
      invalid(() => paintTrimSheet({ seed: 1, strips: { brick: { ...flat, scaleMetres: 0 } } }))
        .fix,
    ).toContain('> 0');
    expect(
      invalid(() =>
        paintTrimSheet({ seed: 1, strips: { brick: { ...flat, scaleMetres: 1, roughness: 2 } } }),
      ).code,
    ).toBe('T3D_RECIPE_INVALID');
  });
  it('rejects unknown strips, cells and kinds', () => {
    const r = { kind: 'flat', scaleMetres: 1, roughness: 0.5 } as const;
    expect(
      invalid(() => paintTrimSheet({ seed: 1, strips: { marble: r } as never })).fix,
    ).toContain('brick');
    expect(
      invalid(() => paintTrimSheet({ seed: 1, strips: {}, cells: { mural: r } as never })).code,
    ).toBe('T3D_RECIPE_INVALID');
    expect(
      invalid(() =>
        paintTrimSheet({ seed: 1, strips: { brick: { ...r, kind: 'tiles' as 'flat' } } }),
      ).fix,
    ).toContain('bond');
  });
  it('rejects cell image bytes that are not a PNG', () => {
    const e = invalid(() =>
      paintTrimSheet({
        seed: 1,
        size: 512,
        strips: {},
        cells: { sign: { image: new Uint8Array(40) } },
      }),
    );
    expect(e.fix).toContain('PNG');
  });
});

describe('paintTrimSheet: output', () => {
  it('returns three RGBA8 maps of the requested size', () => {
    expect(sheet.size).toBe(SIZE);
    for (const m of [sheet.albedo, sheet.normal, sheet.orm]) expect(m.length).toBe(SIZE * SIZE * 4);
  });

  it('is deterministic per seed and changes with the seed', () => {
    const again = paintTrimSheet({ ...DEFAULT_SHEET, size: SIZE });
    expect(Bun.hash(again.albedo)).toBe(Bun.hash(sheet.albedo));
    expect(Bun.hash(again.normal)).toBe(Bun.hash(sheet.normal));
    const other = paintTrimSheet({ ...DEFAULT_SHEET, size: SIZE, seed: 2 });
    expect(Bun.hash(other.albedo)).not.toBe(Bun.hash(sheet.albedo));
  });

  it('keeps strip albedo greyscale and opaque, so vertex colour tints it', () => {
    for (let y = 0; y < SIZE / 2; y += 3)
      for (let x = 0; x < SIZE; x += 7) {
        expect(px(sheet.albedo, x, y, 0)).toBe(px(sheet.albedo, x, y, 1));
        expect(px(sheet.albedo, x, y, 3)).toBe(255);
      }
  });

  it('tiles every strip seamlessly along U (the wrap is no harsher than any interior column)', () => {
    for (const id of STRIPS) {
      const r = stripRect(id);
      const diff = (a: number, b: number): number => {
        let d = 0;
        for (let y = r.v0 * SIZE; y < r.v1 * SIZE; y++)
          d += Math.abs(px(sheet.albedo, a, y) - px(sheet.albedo, b, y));
        return d;
      };
      let worst = 0;
      for (let x = 1; x < SIZE; x++) worst = Math.max(worst, diff(x, x - 1));
      expect(diff(0, SIZE - 1)).toBeLessThanOrEqual(worst);
    }
  });

  it('pads every strip with replicated edge rows so mips stay inside it', () => {
    const r = stripRect('brick');
    const y0 = r.v0 * SIZE;
    for (let x = 0; x < SIZE; x += 5)
      expect(px(sheet.normal, x, y0)).toBe(px(sheet.normal, x, y0 + 2));
  });

  it('writes outward-facing normals (blue ≥ 128) with real relief on brick', () => {
    let tilted = 0;
    const r = stripRect('brick');
    for (let y = r.v0 * SIZE; y < r.v1 * SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        expect(px(sheet.normal, x, y, 2)).toBeGreaterThanOrEqual(128);
        if (Math.abs(px(sheet.normal, x, y, 0) - 128) > 20) tilted++;
      }
    expect(tilted).toBeGreaterThan(500);
  });

  it('packs ORM: iron is rougher than glass, occlusion dips in mortar', () => {
    const mid = (id: 'iron' | 'glass'): number => {
      const r = stripRect(id);
      return px(sheet.orm, 170, Math.round(((r.v0 + r.v1) / 2) * SIZE), 1);
    };
    expect(mid('iron')).toBeGreaterThan(mid('glass'));
    const b = stripRect('brick');
    let minAo = 255;
    for (let x = 0; x < SIZE; x++)
      minAo = Math.min(minAo, px(sheet.orm, x, (b.v0 + b.v1) * SIZE * 0.5));
    expect(minAo).toBeLessThan(200);
  });

  it('paints every cell, and foliage cells carry an alpha leaf mask', () => {
    for (const id of CELLS) {
      const r = cellRect(id);
      const cx = Math.round(((r.u0 + r.u1) / 2) * SIZE);
      const cy = Math.round(((r.v0 + r.v1) / 2) * SIZE);
      let alpha0 = 0;
      let alpha255 = 0;
      for (let y = r.v0 * SIZE; y < r.v1 * SIZE; y++)
        for (let x = r.u0 * SIZE; x < r.u1 * SIZE; x++) {
          const a = px(sheet.albedo, x, y, 3);
          if (a === 0) alpha0++;
          if (a === 255) alpha255++;
        }
      const foliage = (FOLIAGE_CELLS as readonly string[]).includes(id);
      expect(alpha0 > 0).toBe(foliage);
      expect(alpha255).toBeGreaterThan(0);
      expect(px(sheet.albedo, cx, cy, 3)).toBeGreaterThanOrEqual(0);
    }
  });

  it('stamps a supplied PNG into a cell, top row at world-up (high V)', () => {
    const img = new Uint8Array(4 * 4 * 4);
    for (let i = 0; i < 16; i++) img.set(i < 8 ? [255, 0, 0, 255] : [0, 0, 255, 255], i * 4);
    const s = paintTrimSheet({
      seed: 1,
      size: 512,
      strips: {},
      cells: { sign: { image: encodePng(4, 4, img) } },
    });
    const r = cellRect('sign');
    const x = Math.round(((r.u0 + r.u1) / 2) * 512);
    const top = Math.round(r.v1 * 512) - 8;
    expect([...s.albedo.subarray((top * 512 + x) * 4, (top * 512 + x) * 4 + 3)]).toEqual([
      255, 0, 0,
    ]);
  });
});

it('decodePng round-trips encodePng', () => {
  const rgba = new Uint8Array(3 * 2 * 4).map((_, i) => (i * 37) & 255);
  const back = decodePng(encodePng(3, 2, rgba));
  expect([back.width, back.height]).toEqual([3, 2]);
  expect([...back.data]).toEqual([...rgba]);
});
