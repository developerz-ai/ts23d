import { describe, expect, it } from 'bun:test';
import type { Mesh } from '../core/index.ts';
import {
  imageStats,
  METRICS,
  meshStats,
  metricVector,
  type VectorImage,
} from './critique-vector.ts';

/** UV sphere, radius 0.5: smooth (shared vertices, radial normals) or faceted (per-face). */
function sphere(seg: number, faceted: boolean, colour = (_z: number): number[] => [1, 1, 1]): Mesh {
  const pts: number[][] = [];
  for (let i = 0; i <= seg; i++)
    for (let j = 0; j <= seg * 2; j++) {
      const [t, p] = [(Math.PI * i) / seg, (Math.PI * j) / seg];
      pts.push([
        0.5 * Math.sin(t) * Math.cos(p),
        0.5 * Math.sin(t) * Math.sin(p),
        0.5 * Math.cos(t),
      ]);
    }
  const tris: number[] = [];
  const row = seg * 2 + 1;
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < seg * 2; j++) {
      const [a, b, c, d] = [i * row + j, i * row + j + 1, (i + 1) * row + j, (i + 1) * row + j + 1];
      tris.push(a, c, b, b, c, d);
    }
  const P: number[] = [];
  const N: number[] = [];
  const C: number[] = [];
  const idx: number[] = [];
  if (!faceted) {
    for (const p of pts) {
      P.push(...p);
      N.push(...p.map((v) => v * 2));
      C.push(...colour(p[2] ?? 0));
    }
    idx.push(...tris);
  } else
    for (let t = 0; t < tris.length; t += 3) {
      const [a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0]] = [0, 1, 2].map(
        (k) => pts[tris[t + k] ?? 0],
      );
      const u = [0, 1, 2].map((k) => (b[k] ?? 0) - (a[k] ?? 0));
      const v = [0, 1, 2].map((k) => (c[k] ?? 0) - (a[k] ?? 0));
      const [u0 = 0, u1 = 0, u2 = 0] = u;
      const [v0 = 0, v1 = 0, v2 = 0] = v;
      const n = [u1 * v2 - u2 * v1, u2 * v0 - u0 * v2, u0 * v1 - u1 * v0];
      const l = Math.hypot(...n) || 1;
      for (const p of [a, b, c]) {
        idx.push(P.length / 3);
        P.push(...p);
        N.push(...n.map((x) => x / l));
        C.push(...colour(p[2] ?? 0));
      }
    }
  return {
    positions: Float32Array.from(P),
    normals: Float32Array.from(N),
    uvs: new Float32Array((P.length / 3) * 2),
    colors: Float32Array.from(C),
    indices: Uint32Array.from(idx),
  };
}

/** A 64×64 image: a filled disc whose pixels come from `px(x, y)`. */
function disc(px: (x: number, y: number) => [number, number, number]): VectorImage {
  const [W, H] = [64, 64];
  const rgba = new Uint8Array(W * H * 4);
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const inside = Math.hypot(x - 32, y - 32) < 26;
      const [r, g, b] = inside ? px(x, y) : [240, 240, 240];
      rgba.set([r, g, b, 255], i * 4);
      mask[i] = inside ? 255 : 0;
    }
  return { width: W, height: H, rgba, mask };
}

describe('meshStats', () => {
  it('a flat-shaded sphere reads as discontinuous shading, a smooth one does not', () => {
    const flat = meshStats([sphere(12, true)]);
    const smooth = meshStats([sphere(12, false)]);
    expect(flat.smoothShading).toBeLessThan(0.2);
    expect(smooth.smoothShading).toBeGreaterThan(0.9);
    // Same geometry: the curvature histogram and colour samples per metre agree.
    expect(flat.curvSmooth).toBeCloseTo(smooth.curvSmooth, 6);
    expect(flat.texelDensity).toBeCloseTo(smooth.texelDensity, 6);
  });

  it('a coarser sphere has fewer triangles and more large dihedral angles', () => {
    const fine = meshStats([sphere(24, false)]);
    const coarse = meshStats([sphere(5, false)]);
    expect(coarse.tris).toBeLessThan(fine.tris);
    expect(coarse.curvSmooth).toBeLessThan(fine.curvSmooth);
  });

  it('colour detail is zero for a plain colour and rises with banded colour', () => {
    const plain = meshStats([sphere(12, false)]);
    const banded = meshStats([sphere(12, false, (z) => (z > 0 ? [1, 0, 0] : [0, 0, 1]))]);
    expect(plain.colourDetail).toBe(0);
    expect(banded.colourDetail).toBeGreaterThan(0);
  });
});

describe('imageStats', () => {
  it('a grey image has no chroma; a coloured one does', () => {
    expect(imageStats(disc(() => [120, 120, 120])).chroma).toBe(0);
    expect(imageStats(disc(() => [200, 60, 40])).chroma).toBeGreaterThan(0.5);
  });

  it('noise raises high-frequency energy and lowers the rest share', () => {
    const calm = imageStats(disc(() => [128, 128, 128]));
    const busy = imageStats(
      disc((x, y) => ((x * 7 + y * 13) % 5 < 2 ? [60, 60, 60] : [200, 200, 200])),
    );
    expect(calm.hiFreq).toBe(0);
    expect(calm.restShare).toBe(1);
    expect(busy.hiFreq).toBeGreaterThan(0.1);
    expect(busy.restShare).toBeLessThan(0.1);
    expect(busy.valueRange).toBeGreaterThan(calm.valueRange);
  });

  it('an empty mask is all zeros, never NaN', () => {
    const img = disc(() => [0, 0, 0]);
    const empty = imageStats({ ...img, mask: new Uint8Array(img.mask.length) });
    expect(Object.values(empty).every((v) => v === 0)).toBe(true);
  });
});

describe('metricVector', () => {
  it('has every metric, finite and rounded, and is deterministic', () => {
    const lod0 = {
      name: 'ball',
      parts: [{ mesh: sphere(10, false) }],
    } as unknown as Parameters<typeof metricVector>[0];
    const img = disc((x) => [100 + x, 90, 80]);
    const a = metricVector(lod0, img);
    expect(Object.keys(a)).toEqual([...METRICS]);
    expect(Object.values(a).every((v) => Number.isFinite(v))).toBe(true);
    expect(metricVector(lod0, img)).toEqual(a);
  });
});
