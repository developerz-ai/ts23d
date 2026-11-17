// Meshy request building without any request: option refusals, per-model face caps, the cost table.

import { describe, expect, test } from 'bun:test';
import {
  checkOptions,
  imageBody,
  type MeshyOptions,
  meshOptions,
  meshyCost,
  multiBody,
} from './meshy-params.ts';

const KEY = 'msy_fake';
const o = (more: Partial<MeshyOptions> = {}): MeshyOptions => ({ apiKey: KEY, ...more });

describe('meshy params: failures first', () => {
  test('options Meshy would answer 400 to are refused up front', () => {
    expect(() => checkOptions(o(), 'meshy-99')).toThrow(/not a Meshy mesh model/);
    expect(() =>
      checkOptions(o({ texture: true, textureResolution: '8k' }), 'meshy-6-lite'),
    ).toThrow(/no 8k textures/);
    expect(() => checkOptions(o({ geometryResolution: '4k' }), 'meshy-6')).toThrow(
      /no 4k geometry/,
    );
    expect(() => checkOptions(o({ pbr: true }), 'latest')).toThrow(/need a texture/);
    expect(() => checkOptions(o({ geometryResolution: '2k' }), 'meshy-7.1')).not.toThrow();
  });
  test('request params: unknown names, wrong types and values are refused; multi-image limits', () => {
    const bad = (params: Record<string, unknown>) => () => meshOptions(o(), { params });
    expect(bad({ textur: true })).toThrow(/params\.textur is not a Meshy knob/);
    expect(bad({ texture: 'yes' })).toThrow(/params\.texture is "yes"/);
    expect(bad({ textureResolution: '16k' })).toThrow(/textureResolution is "16k"/);
    expect(() => meshOptions(o(), { pose: 'sitting' })).toThrow(/pose is "sitting"/);
    expect(() => multiBody(o(), 'meshy-t2.5', ['a'])).toThrow(/no smart-topology model/);
    expect(() => multiBody(o({ geometryResolution: '4k' }), 'latest', ['a'])).toThrow(
      /4k geometry/,
    );
    expect(() => multiBody(o(), 'latest', ['a', 'b', 'c', 'd', 'e'])).toThrow(/got 5 images/);
  });
});

describe('meshy params', () => {
  test('per-model face caps: t2 15 000, t2.5 30 000, standard 300 000; smart models skip enhancement', () => {
    const got = ['meshy-t2', 'meshy-t2.5', 'meshy-6-lite', 'latest'].map((id) => {
      const b = imageBody(o(), id, 'data:image/png;base64,AA', 1_000_000);
      return [id, b['target_polycount'], 'image_enhancement' in b, b['model_type'] ?? 'standard'];
    });
    expect(got).toEqual([
      ['meshy-t2', 15_000, false, 'smart-topology'],
      ['meshy-t2.5', 30_000, false, 'smart-topology'],
      ['meshy-6-lite', 300_000, false, 'standard'],
      ['latest', 300_000, true, 'standard'],
    ]);
    expect(imageBody(o(), 'latest', 'x', 10)['target_polycount']).toBe(100);
  });

  test('a request overrides the adapter options: params and pose win', () => {
    const got = meshOptions(o({ texture: false, poseMode: 't-pose' }), {
      pose: 'a-pose',
      params: { texture: true, pbr: true },
    });
    expect([got.texture, got.pbr, got.poseMode, got.apiKey]).toEqual([true, true, 'a-pose', KEY]);
    expect(multiBody(got, 'latest', ['f', 's'])).toMatchObject({
      image_urls: ['f', 's'],
      pose_mode: 'a-pose',
      should_texture: true,
      enable_pbr: true,
      image_enhancement: false,
      target_formats: ['glb'],
    });
  });

  test('meshyCost: ultra geometry, texture pass, 8k and a foreign texture model', () => {
    expect([
      meshyCost(o(), 'latest'),
      meshyCost(o({ texture: true }), 'meshy-6-lite'),
      meshyCost(o({ texture: true, geometryResolution: '2k', textureResolution: '8k' }), 'latest'),
      meshyCost(o({ texture: true, textureModel: 'meshy-n1' }), 'latest'),
      meshyCost(o({ texture: true, textureModel: 'meshy-7' }), 'latest'),
    ]).toEqual([20, 15, 40, 40, 30]);
  });
});
