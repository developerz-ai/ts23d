// Projection, atlas, determinism and cache: the bake recovers a known texture, the atlas never
// overlaps, control maps and the mock are byte-stable, and a cache hit replays without the model.

import { describe, expect, it } from 'bun:test';
import { compile } from '../core/index.ts';
import { cart, cube, gradient, worldGradient } from './fixtures.ts';
import {
  atlasTexels,
  controlViews,
  decodeViews,
  exportControlMaps,
  finishAsset,
  finishScene,
  memoryStore,
  mockFinish,
  project,
} from './index.ts';

const SMALL = { views: 6, size: 96, atlas: 256 } as const;

describe('projection bake', () => {
  it('a bake that ignores visibility would not match; ours recovers f(position) on a cube', async () => {
    const s = finishScene(compile(cube, { lod: 0 }), 256);
    const cv = controlViews(s, { views: 8, size: 160 });
    const t = atlasTexels(s);
    const pr = project(
      t,
      cv,
      decodeViews(cv, await worldGradient.run({ views: cv, prompt: 'x', seed: 1 })),
    );
    const errs: number[] = [];
    let wrong = 0;
    for (let i = 0; i < t.part.length; i++) {
      if ((pr.weight[i] ?? 0) <= 0) continue;
      const want = gradient([
        t.position[i * 3] ?? 0,
        t.position[i * 3 + 1] ?? 0,
        t.position[i * 3 + 2] ?? 0,
      ]);
      errs.push(Math.max(...want.map((w, c) => Math.abs(w - (pr.rgb[i * 3 + c] ?? 0)))));
      // The same texel against a mirrored position: what a flipped / misplaced bake would give.
      const flip = gradient([
        -(t.position[i * 3] ?? 0),
        t.position[i * 3 + 1] ?? 0,
        t.position[i * 3 + 2] ?? 0,
      ]);
      if (Math.abs((flip[0] ?? 0) - (pr.rgb[i * 3] ?? 0)) > 8) wrong++;
    }
    errs.sort((a, b) => a - b);
    expect(errs.length).toBeGreaterThan(0.6 * t.part.filter((p) => p >= 0).length);
    expect(errs[Math.floor(errs.length * 0.5)] ?? 99).toBeLessThan(3);
    expect(errs[Math.floor(errs.length * 0.95)] ?? 99).toBeLessThan(10);
    expect(wrong).toBeGreaterThan(errs.length * 0.3);
  });

  it('atlas charts do not overlap: summed triangle UV area ≈ covered texels', () => {
    const s = finishScene(compile(cart, { lod: 0 }), 512);
    let area = 0;
    s.world.forEach((m, p) => {
      if (!m || !s.finishable[p]) return;
      const U = m.uvs;
      for (let k = 0; k < m.indices.length; k += 3) {
        const [a, b, c] = [m.indices[k] ?? 0, m.indices[k + 1] ?? 0, m.indices[k + 2] ?? 0];
        area +=
          Math.abs(
            ((U[b * 2] ?? 0) - (U[a * 2] ?? 0)) * ((U[c * 2 + 1] ?? 0) - (U[a * 2 + 1] ?? 0)) -
              ((U[c * 2] ?? 0) - (U[a * 2] ?? 0)) * ((U[b * 2 + 1] ?? 0) - (U[a * 2 + 1] ?? 0)),
          ) / 2;
      }
    });
    const covered = atlasTexels(s).part.filter((p) => p >= 0).length;
    expect(Math.abs(area * 512 * 512 - covered) / covered).toBeLessThan(0.08);
    for (const m of s.world) for (const u of m?.uvs ?? []) expect(u >= 0 && u <= 1).toBe(true);
  });
});

describe('determinism and cache', () => {
  it('control maps, mock images and the finish are byte-stable', async () => {
    const run = async () => {
      const r = await finishAsset(compile(cart, { lod: 0 }), {
        ...SMALL,
        model: mockFinish(),
        prompt: 'rust',
      });
      return { r, files: exportControlMaps(r.controls).files };
    };
    const [a, b] = [await run(), await run()];
    expect(a.r.controls.hash).toBe(b.r.controls.hash);
    expect(a.r.images).toEqual(b.r.images);
    expect(Bun.hash(a.r.maps.albedo)).toBe(Bun.hash(b.r.maps.albedo));
    expect([...a.files.keys()]).toEqual([...b.files.keys()]);
    for (const [k, v] of a.files)
      expect(Bun.hash(v)).toBe(Bun.hash(b.files.get(k) ?? new Uint8Array()));
    const legend = JSON.parse(new TextDecoder().decode(a.files.get('legend.json'))) as {
      parts: Record<string, string>;
    };
    expect(new Set(Object.values(legend.parts)).size).toBe(Object.keys(legend.parts).length);
  });

  it('a second run is a cache hit: same images, the model is not called', async () => {
    const store = memoryStore();
    const model = { calls: 0 };
    const counted = {
      id: 'counting',
      run: (r: Parameters<typeof worldGradient.run>[0]) => {
        model.calls++;
        return worldGradient.run(r);
      },
    };
    const o = { ...SMALL, model: counted, prompt: 'x', store };
    const first = await finishAsset(compile(cart, { lod: 0 }), o);
    const second = await finishAsset(compile(cart, { lod: 0 }), o);
    expect([first.cache, second.cache, model.calls, store.size()]).toEqual(['miss', 'hit', 1, 1]);
    expect(second.images).toEqual(first.images);
    const other = await finishAsset(compile(cart, { lod: 0 }), { ...o, seed: 2 });
    expect([other.cache, model.calls]).toEqual(['miss', 2]);
  });
});
