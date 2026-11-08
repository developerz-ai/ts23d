import { describe, expect, test } from 'bun:test';
import { Glob } from 'bun';
import { createRng } from '../core/index.ts';
import { encodeDem } from './dem.ts';
import { terrainFromDEM } from './terrain-from-dem.ts';

// A 1 × 1 km bowl: 1000 m in the middle, rising to ~1400 m at the corners.
const N = 16;
const heights = Float64Array.from({ length: (N + 1) ** 2 }, (_, k) => {
  const x = (k % (N + 1)) / N - 0.5;
  const y = Math.floor(k / (N + 1)) / N - 0.5;
  return 1000 + 800 * (x * x + y * y);
});
const DEM = encodeDem(
  { centre: { lat: 46, lon: 7 }, size: [1000, 1000], cells: N, zoom: 12 },
  heights,
  {
    name: 'bowl',
    source: { name: 'synthetic', url: 'none', tiles: [], fetched: '2026-11-07' },
    license: 'CC0-1.0',
    attribution: 'test',
  },
);
const GROUND = { treeline: 1200, snowline: 1350 };

const zRange = (p: Float32Array): [number, number] => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 2; i < p.length; i += 3) {
    lo = Math.min(lo, p[i] ?? 0);
    hi = Math.max(hi, p[i] ?? 0);
  }
  return [lo, hi];
};

describe('terrainFromDEM', () => {
  test('a tampered DEM never meshes', () => {
    expect(() =>
      terrainFromDEM({ ...DEM, sha256: '0'.repeat(64) }, { lod: 0, ground: GROUND }),
    ).toThrow('T3D_DATA_HASH');
  });

  test('true scale by default: skirt to z = 0, relief + base on top', () => {
    const t = terrainFromDEM(DEM, { lod: 0, ground: GROUND, base: 40 });
    expect(t.datum).toBe(960);
    const [lo, hi] = zRange(t.terrain.positions);
    expect(lo).toBe(0);
    expect(hi).toBeCloseTo(1400 - 960, 0);
    // 16² cells × 2 + 4 · 16 skirt quads × 2, unwelded for strips.
    expect(t.terrain.indices.length / 3).toBe(2 * 16 * 16 + 8 * 16);
    expect(t.water).toBeUndefined();
  });

  test('LODs only change density; size and vertical scale the output', () => {
    const tris = [0, 1, 2].map(
      (lod) => terrainFromDEM(DEM, { lod, ground: GROUND }).terrain.indices.length / 3,
    );
    expect(tris).toEqual([640, 192, 64]);
    const small = terrainFromDEM(DEM, { lod: 2, ground: GROUND, size: 100, vertical: 2 });
    expect(small.grid.rect).toEqual([-50, -50, 50, 50]);
    expect(small.zPerMetre).toBeCloseTo(0.2, 9);
    expect(zRange(small.terrain.positions)[1]).toBeCloseTo((1400 - 960) * 0.2, 0);
  });

  test('water only where the ground dips below the level, at that level', () => {
    const t = terrainFromDEM(DEM, {
      lod: 0,
      ground: GROUND,
      strips: false,
      water: { level: 1050 },
    });
    const w = t.water;
    expect(w).toBeDefined();
    const [lo, hi] = zRange(w?.positions ?? new Float32Array());
    expect(lo).toBeCloseTo(1050 - t.datum, 3);
    expect(hi).toBeCloseTo(1050 - t.datum, 3);
    const quads = (w?.indices.length ?? 0) / 6;
    expect(quads).toBeGreaterThan(0);
    expect(quads).toBeLessThan(16 * 16 * 0.5);
  });

  test('erosion detail is seeded: same rng, same mesh', () => {
    const a = terrainFromDEM(DEM, {
      lod: 2,
      ground: GROUND,
      detail: { rng: createRng(7), droplets: 300 },
    });
    const b = terrainFromDEM(DEM, {
      lod: 2,
      ground: GROUND,
      detail: { rng: createRng(7), droplets: 300 },
    });
    expect(a.terrain.positions).toEqual(b.terrain.positions);
  });

  test('compile is offline: no network call anywhere in src/data', async () => {
    const offenders: string[] = [];
    for await (const f of new Glob('*.ts').scan(import.meta.dir)) {
      if (f.endsWith('.test.ts')) continue;
      const src = await Bun.file(`${import.meta.dir}/${f}`).text();
      if (/\bfetch\s*\(|XMLHttpRequest|node:(https?|net)|WebSocket/.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
