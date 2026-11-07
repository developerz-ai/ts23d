import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, merge } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { bakeAo, bakeAoAsset } from './bake-ao.ts';

const white: [number, number, number] = [1, 1, 1];

describe('bakeAo', () => {
  it('leaves surfaces farther than radius and a lone convex box untouched', () => {
    const floor = box({ size: [4, 4, 0.1], color: white });
    const crate = box({ size: [1, 1, 1], at: [0, 0, 0.1], color: white });
    const baked = bakeAo(floor, { ground: false }, merge([floor, crate]));
    const top = [...Array(baked.positions.length / 3).keys()].filter(
      (i) => (baked.positions[i * 3 + 2] ?? 0) > 0.09 && (baked.normals[i * 3 + 2] ?? 0) > 0.9,
    );
    // The floor's top corners are 2 m from the crate: beyond radius 1 → untouched.
    for (const i of top) expect(baked.colors[i * 3]).toBe(1);
    const lone = bakeAo(crate, { ground: false });
    expect(Math.min(...lone.colors)).toBe(1);
  });

  it('bakes contact shadow across parts and onto the ground, deterministically', () => {
    const a = defineAsset({
      name: 'stack',
      kind: 'prop',
      budget: { triangles: [99, 99, 99] },
      build: (ctx) => {
        ctx.part('base', box({ size: [1, 1, 0.5], color: white }));
        ctx.part('top', box({ size: [0.5, 0.5, 0.5], color: white }), { at: [0, 0, 0.5] });
      },
    });
    const baked = bakeAoAsset(compile(a), { samples: 32 });
    const base = baked.parts.find((p) => p.name === 'base')?.mesh;
    const topMesh = baked.parts.find((p) => p.name === 'top')?.mesh;
    // Base: its bottom touches the ground → darkened. Top: its lower side vertices sit on the base.
    expect(Math.min(...(base?.colors ?? [1]))).toBeLessThan(0.8);
    expect(Math.min(...(topMesh?.colors ?? [1]))).toBeLessThan(0.9);
    expect(Math.max(...(topMesh?.colors ?? [0]))).toBe(1);
    const again = bakeAoAsset(compile(a), { samples: 32 });
    expect(Bun.hash(again.parts[0]?.mesh?.colors ?? new Float32Array())).toBe(
      Bun.hash(base?.colors ?? new Float32Array()),
    );
  });

  it('reuses one occluder index across calls without changing a byte', () => {
    const floor = box({ size: [2, 2, 0.1], color: white });
    const post = box({ size: [0.2, 0.2, 1], at: [0, 0, 0.1], color: white });
    const occ = merge([floor, post]);
    const first = bakeAo(floor, { ground: false, radius: 0.8 }, occ);
    bakeAo(post, { ground: false, radius: 0.8 }, occ);
    const again = bakeAo(floor, { ground: false, radius: 0.8 }, occ);
    const fresh = bakeAo(floor, { ground: false, radius: 0.8 }, merge([floor, post]));
    expect(Bun.hash(again.colors)).toBe(Bun.hash(first.colors));
    expect(Bun.hash(fresh.colors)).toBe(Bun.hash(first.colors));
  });
});
