// Texture sets as the renderers read them: an undecodable map fails with the part's name, maps
// decode once per content, mips halve down from the image itself, sampling clamps and decodes
// sRGB, and a scene records which triangles use which set.

import { describe, expect, it } from 'bun:test';
import { Ts23dError } from '../core/index.ts';
import { renderBeauty } from './beauty.ts';
import { sceneOf } from './scene.ts';
import { contactSheet } from './sheet.ts';
import { CHECKER, checker, png, textured, tilt } from './texture-set-fixtures.ts';
import { SRGB_LUT, sampleSet, setAlpha, setTextures, UNIT_LUT } from './texture-sets.ts';

/** A PNG with a valid header (compile accepts it) whose pixel data is garbage. */
const broken = (): Uint8Array => {
  const ok = png(4, () => [9, 9, 9]);
  return ok.map((v, i) => (i >= 41 && i < ok.length - 12 ? 0x55 : v));
};

describe('texture sets: decode', () => {
  it('a map that does not decode is T3D_TEXTURE_INVALID naming the part, in every renderer', () => {
    const bad = textured({ name: 'skin', albedo: broken() });
    for (const render of [() => sceneOf(bad), () => renderBeauty(bad), () => contactSheet(bad)]) {
      let err: unknown;
      try {
        render();
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(Ts23dError);
      expect((err as Ts23dError).code).toBe('T3D_TEXTURE_INVALID');
      expect((err as Ts23dError).message).toContain("part 'card' texture set 'skin' albedo");
    }
    const normal = textured({ name: 'skin', albedo: checker(), normal: broken() });
    expect(() => sceneOf(normal)).toThrow(/texture set 'skin' normal/);
  });

  it('equal bytes decode once; different bytes do not share', () => {
    const a = setTextures({ name: 'a', albedo: checker() }, 'p');
    const b = setTextures({ name: 'b', albedo: checker() }, 'q');
    expect(b.albedo).toBe(a.albedo);
    expect(setTextures({ name: 'c', albedo: png(2, () => [1, 2, 3]) }, 'p').albedo).not.toBe(
      a.albedo,
    );
  });

  it('level 0 is the image; mips halve to 4² and average in linear light', () => {
    const t = setTextures(
      { name: 'm', albedo: png(16, (x) => (x % 2 ? [255, 255, 255] : [0, 0, 0])) },
      'p',
    );
    expect(t.albedo.map((m) => m.size)).toEqual([16, 8, 4]);
    expect([...(t.albedo[0]?.data.subarray(0, 8) ?? [])]).toEqual([
      0, 0, 0, 255, 255, 255, 255, 255,
    ]);
    // Half black, half white is linear 0.5 = sRGB 188, not the byte average 128.
    expect(t.albedo[1]?.data[0]).toBe(188);
    expect(t.albedo[2]?.data[0]).toBe(188);
  });

  it('factors default to 0.8 / 0, and a smaller normal map shifts its mip level', () => {
    const t = setTextures({ name: 'f', albedo: png(16, () => [5, 5, 5]), normal: tilt(0, 0) }, 'p');
    expect([t.roughness, t.metallic, t.size]).toEqual([0.8, 0, 16]);
    expect([t.normalShift, t.ormShift]).toEqual([2, 0]);
    expect(
      setTextures({ name: 'g', albedo: checker(), metallic: 1, roughness: 0.3 }, 'p'),
    ).toMatchObject({
      roughness: 0.3,
      metallic: 1,
    });
  });
});

describe('texture sets: sampling', () => {
  const out = new Float32Array(4);
  const t = setTextures({ name: 'c', albedo: checker() }, 'p');

  it('clamps at the border instead of wrapping', () => {
    sampleSet(t.albedo, 0, -0.4, 0.1, SRGB_LUT, out);
    expect([...out]).toEqual([1, 0, 0, 1]);
    sampleSet(t.albedo, 0, 1.4, 0.1, SRGB_LUT, out);
    expect([...out]).toEqual([0, 1, 0, 1]);
    sampleSet(t.albedo, 0, 0.1, 7, SRGB_LUT, out);
    expect([...out]).toEqual([0, 0, 1, 1]);
  });

  it('filters bilinearly and decodes through the table it is given', () => {
    const grey = setTextures(
      { name: 'g', albedo: png(2, (x) => (x ? [255, 255, 255] : [0, 0, 0])) },
      'p',
    );
    sampleSet(grey.albedo, 0, 0.5, 0.5, UNIT_LUT, out);
    expect(out[0]).toBeCloseTo(0.5, 5);
    sampleSet(grey.albedo, 9, 0.5, 0.5, SRGB_LUT, out);
    expect(out[0]).toBeCloseTo(0.5, 5);
  });

  it('reads the albedo alpha for cutouts', () => {
    const a = setTextures({ name: 'a', albedo: png(2, (x) => [200, 200, 200, x ? 255 : 0]) }, 'p');
    expect(setAlpha(a, 0, 0.1, 0.5)).toBe(0);
    expect(setAlpha(a, 0, 0.9, 0.5)).toBe(1);
  });
});

describe('texture sets: scene', () => {
  it('an untextured scene carries no sets; a textured one indexes them per triangle', () => {
    const s = sceneOf(textured({ name: 'skin', albedo: checker(), normal: tilt(0, 0) }));
    expect([...s.texSet]).toEqual([1, 1]);
    expect(s.sets.map((x) => x.name)).toEqual(['skin']);
    // Tangent +U = +Y, handedness +1: cross(N, T) = +Z is image up (decreasing v).
    expect([...s.vtan.subarray(0, 4)]).toEqual([0, 1, 0, 1]);
    const flipped = sceneOf(textured({ name: 'skin', albedo: checker() }, { mirror: true }));
    expect([...flipped.vtan.subarray(0, 4)]).toEqual([0, -1, 0, -1]);
    expect(CHECKER).toHaveLength(4);
  });
});
