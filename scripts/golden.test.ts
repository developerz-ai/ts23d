import { describe, expect, it } from 'bun:test';
import type { Mesh } from '../src/core/index.ts';
import { packGlb, readGlb } from '../src/neural/index.ts';
import type { GoldenSet } from '../src/qa/critique-calibrate.ts';
import { METRICS, type MetricVector } from '../src/qa/critique-vector.ts';
import { checkGolden, main } from './golden.ts';
import { blurColours, desaturate, flatShade } from './golden-degrade.ts';
import { gltfToGlb, pngUrl } from './golden-fetch.ts';
import { panelMedians, shuffleFor } from './golden-panel.ts';

/** Two triangles sharing an edge, a red and a blue corner. */
const quad = (): Mesh => ({
  positions: Float32Array.from([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
  normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
  uvs: new Float32Array(8),
  colors: Float32Array.from([1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1]),
  indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
});

describe('gltfToGlb', () => {
  const gltf = {
    asset: { version: '2.0' },
    buffers: [{ uri: 'x.bin', byteLength: 6 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 6 }],
    images: [{ uri: 'textures/x_diff_1k.jpg' }, { uri: 'textures/x_nor_gl_1k.jpg' }],
    textures: [{ source: 0 }, { source: 1 }],
    materials: [
      {
        name: 'm',
        pbrMetallicRoughness: { baseColorTexture: { index: 0 }, baseColorFactor: [1, 1, 1, 1] },
        normalTexture: { index: 1 },
      },
    ],
    extensionsUsed: ['KHR_texture_transform'],
  };

  it('embeds only the baseColor image as PNG, 4-byte aligned, and drops other maps', () => {
    const png = Uint8Array.from([137, 80, 78, 71, 1]);
    const asked: string[] = [];
    const { json, bin } = gltfToGlb(gltf, Uint8Array.from([1, 2, 3, 4, 5, 6]), (uri) => {
      asked.push(uri);
      return png;
    });
    expect(asked).toEqual(['textures/x_diff_1k.jpg']);
    expect(json['images']).toEqual([{ bufferView: 1, mimeType: 'image/png' }]);
    expect(json['bufferViews']).toEqual([
      { buffer: 0, byteOffset: 0, byteLength: 6 },
      { buffer: 0, byteOffset: 8, byteLength: 5 },
    ]);
    expect(json['extensionsUsed']).toBeUndefined();
    expect(JSON.stringify(json['materials'])).not.toContain('normalTexture');
    expect([...bin.subarray(8, 13)]).toEqual([...png]);
    expect(readGlb(packGlb(json, bin)).json['images']).toEqual(json['images']);
  });

  it('refuses a file with more than one buffer', () => {
    expect(() =>
      gltfToGlb({ ...gltf, buffers: [{}, {}] }, new Uint8Array(4), () => new Uint8Array()),
    ).toThrow('expected one buffer');
  });

  it("maps a JPEG map URL to Poly Haven's PNG twin", () => {
    expect(pngUrl('https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/a/a_diff_1k.jpg')).toBe(
      'https://dl.polyhaven.org/file/ph-assets/Models/png/1k/a/a_diff_1k.png',
    );
  });
});

describe('degrade', () => {
  it('flat shading splits every corner and gives it the face normal', () => {
    const f = flatShade(quad());
    expect(f.positions.length / 3).toBe(6);
    expect([...f.normals.subarray(0, 3)]).toEqual([0, 0, 1]);
    expect([...f.colors.subarray(0, 3)]).toEqual([1, 0, 0]);
  });

  it('desaturation leaves no chroma; blurring narrows the colour spread', () => {
    const d = desaturate(quad());
    for (let i = 0; i < d.colors.length; i += 3)
      expect(d.colors[i]).toBe(d.colors[i + 2] ?? Number.NaN);
    const spread = (m: Mesh): number => Math.max(...m.colors) - Math.min(...m.colors);
    expect(spread(blurColours(quad(), 4))).toBeLessThan(spread(quad()));
  });
});

describe('panel', () => {
  it('shuffles deterministically into a permutation', () => {
    const a = shuffleFor('ph:lion_head', 5);
    expect([...a].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(shuffleFor('ph:lion_head', 5)).toEqual(a);
  });

  it('takes the median per tile and maps tiles back to variants', () => {
    const tile = (overall: number) => ({ '1': { overall }, '2': { overall: overall - 3 } });
    const reviews = [5, 7, 9].map((s, i) => ({ reviewer: `r${i}`, scores: { g: tile(s) } }));
    const m = panelMedians(reviews, { g: ['flat', 'original'] }, ['overall']);
    expect(m).toEqual({ 'g:flat': { overall: 7 }, 'g:original': { overall: 4 } });
  });

  it('refuses a score outside 0–10 and skips tiles a review left out', () => {
    const bad = [{ reviewer: 'r', scores: { g: { '1': { overall: 11 } } } }];
    expect(() => panelMedians(bad, { g: ['original'] }, ['overall'])).toThrow('not a score');
    const partial = [{ reviewer: 'r', scores: { g: { '1': { overall: 6 } } } }];
    expect(panelMedians(partial, { g: ['original', 'flat'] }, ['overall'])).toEqual({
      'g:original': { overall: 6 },
    });
  });
});

describe('checkGolden', () => {
  const v = (x: number): MetricVector =>
    Object.fromEntries(METRICS.map((m) => [m, x])) as MetricVector;
  const row = (g: number, variant: string, q: number, x: number) => ({
    id: `g${g}:${variant}`,
    group: `g${g}`,
    variant,
    vector: v(x),
    panel: { overall: q, silhouette: q, proportions: q, materials: q, detail: q, wear: q },
  });

  it('reports a degraded copy the model ranks at or above its original', () => {
    const rows = [0, 1, 2, 3, 4, 5].flatMap((g) => [
      row(g, 'original', 5 + g / 2, 0.5 + g / 20),
      row(g, 'flat', 2 + g / 2, 0.2 + g / 20),
    ]);
    const good: GoldenSet = { reviewer: 't', rows };
    expect(checkGolden(good).inversions).toEqual([]);
    const flipped: GoldenSet = {
      reviewer: 't',
      rows: rows.map((r) => (r.id === 'g3:flat' ? { ...r, vector: v(0.99) } : r)),
    };
    expect(checkGolden(flipped).inversions[0]).toContain('g3:flat');
  });
});

describe('main', () => {
  it('prints usage and exits 2 on an unknown command', async () => {
    expect(await main(['nope'])).toBe(2);
    expect(await main(['panel'])).toBe(2);
  });
});
