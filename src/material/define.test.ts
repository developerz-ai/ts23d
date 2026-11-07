import { afterAll, describe, expect, it } from 'bun:test';
import { encodePng, Ts23dError } from '../core/index.ts';
import {
  defineMaterial,
  materialOf,
  resetMaterials,
  stripCredits,
  textureSources,
} from './define.ts';
import { DEFAULT_SHEET, paintTrimSheet } from './generator.ts';
import type { MaterialDef } from './material-def.ts';
import { provideTextures } from './texture-source.ts';
import { CUSTOM_STRIP_SLOTS, type StripId, stripRect } from './trim-sheet.ts';

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof Ts23dError) return e.code;
    throw e;
  }
  return 'no error';
}

const SIZE = 512;
const rowMid = (id: StripId): number =>
  Math.round(((stripRect(id).v0 + stripRect(id).v1) / 2) * SIZE);
const at = (map: Uint8Array, x: number, y: number, k: number): number =>
  map[(y * SIZE + x) * 4 + k] ?? -1;

const png = encodePng(
  4,
  4,
  new Uint8Array(64).map((_, i) => (i % 4 === 3 ? 255 : 40 + (i % 4) * 60)),
);
const sha = new Bun.CryptoHasher('sha256').update(png).digest('hex');
resetMaterials();
afterAll(resetMaterials);

// Provided up front: registered materials are process-wide, and other test files paint them.
provideTextures(new Map([[sha, png]]));
const imageDef: MaterialDef = {
  id: 'test_image',
  roughness: 0.7,
  texture: {
    source: 'file',
    id: 'swatch',
    license: 'CC0-1.0',
    page: 'https://example.org/swatch',
    metres: [1, 1],
    maps: { albedo: { url: 'swatch.png', sha256: sha } },
  },
};

describe('defineMaterial: bad input', () => {
  it('rejects bad numbers, ids and colours with T3D_MATERIAL_INVALID', () => {
    expect(code(() => defineMaterial({ id: 'bad_rough', roughness: 2 }))).toBe(
      'T3D_MATERIAL_INVALID',
    );
    expect(code(() => defineMaterial({ id: 'Bad Id', roughness: 0.5 }))).toBe(
      'T3D_MATERIAL_INVALID',
    );
    expect(code(() => defineMaterial({ id: 'bad_hex', roughness: 0.5, albedo: 'red' }))).toBe(
      'T3D_MATERIAL_INVALID',
    );
    const gpl = { ...imageDef, id: 'bad_lic', texture: { ...imageDef.texture, license: 'GPL' } };
    expect(code(() => defineMaterial(gpl as unknown as MaterialDef))).toBe('T3D_MATERIAL_INVALID');
  });

  it('refuses built-in ids and conflicting redefinitions', () => {
    expect(code(() => defineMaterial({ id: 'oak', roughness: 0.5 }))).toBe('T3D_MATERIAL_CONFLICT');
    defineMaterial({ id: 'test_teak', roughness: 0.6 });
    expect(code(() => defineMaterial({ id: 'test_teak', roughness: 0.5 }))).toBe(
      'T3D_MATERIAL_CONFLICT',
    );
  });

  it('names unknown strips, and a painter that writes NaN fails the paint', () => {
    expect(code(() => stripRect('nope' as StripId))).toBe('T3D_MATERIAL_UNKNOWN');
    expect(code(() => materialOf('nope' as StripId))).toBe('T3D_MATERIAL_UNKNOWN');
    // Through a sheet override, so no poisoned material stays registered for other test files.
    const nan = {
      kind: 'flat',
      scaleMetres: 1,
      roughness: 0.5,
      paint: (s: { tone: Float32Array }) => s.tone.fill(Number.NaN),
    };
    expect(
      code(() => paintTrimSheet({ seed: 1, size: SIZE, strips: { plain: nan } as never })),
    ).toBe('T3D_MATERIAL_INVALID');
  });

  it('needs cached bytes for an image strip', () => {
    const tex = imageDef.texture;
    if (!tex) throw new Error('fixture');
    const other = { ...tex, maps: { albedo: { url: 'x.png', sha256: 'f'.repeat(64) } } };
    const strips = { plain: { kind: 'flat', scaleMetres: 1, roughness: 0.5, texture: other } };
    expect(code(() => paintTrimSheet({ seed: 1, size: SIZE, strips } as never))).toBe(
      'T3D_TEXTURE_MISSING',
    );
  });

  it('runs out of custom rows with T3D_SHEET_FULL', () => {
    defineMaterial(imageDef);
    defineMaterial({ id: 'test_fill', roughness: 0.5 });
    defineMaterial({ id: 'test_fill2', roughness: 0.5 });
    expect(CUSTOM_STRIP_SLOTS).toBe(4);
    expect(code(() => defineMaterial({ id: 'test_over', roughness: 0.5 }))).toBe('T3D_SHEET_FULL');
  });
});

describe('defineMaterial: output', () => {
  it('is idempotent and paints its own row with its colour, roughness and painter', () => {
    const teak = defineMaterial({ id: 'test_teak', roughness: 0.6 });
    expect(teak).toBe(defineMaterial({ id: 'test_teak', roughness: 0.6 }));
    expect(String(teak)).toBe('test_teak');
    expect(materialOf(teak).origin).toBe('defined');
    expect(materialOf('brass').origin).toBe('library');
    expect(materialOf('brick').origin).toBe('classic');
    const sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: SIZE });
    const y = rowMid('test_image' as StripId);
    expect([0, 1, 2].map((k) => at(sheet.albedo, 100, y, k))).toEqual([40, 100, 160]);
    expect(Math.abs(at(sheet.orm, 100, rowMid(teak), 1) - 0.6 * 255)).toBeLessThan(25);
  });

  it('credits image strips only when a mesh samples them', () => {
    const r = stripRect('test_image' as StripId);
    expect(stripCredits([0.001, 0.002])).toEqual([]);
    expect(stripCredits([(r.v0 + r.v1) / 2])[0]).toContain('CC0-1.0');
    expect(textureSources().map((t) => t.id)).toEqual(['swatch']);
  });
});
