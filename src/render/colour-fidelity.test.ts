// Two reported "the renderer flattens colour" suspicions, pinned as tests (both measured not to
// be renderer defects): vertex-colour wear on a large ground keeps its contrast in a big scene in
// both beauty renders, and the contact sheet's FAR panel lights a coarse mesh as bright as a fine
// one of the same colour.

import { describe, expect, it } from 'bun:test';
import { type CompiledAsset, compile, defineAsset, type Mesh } from '../core/index.ts';
import { decodePng } from '../material/index.ts';
import { box, lathe } from '../primitives/index.ts';
import { cameraFor, renderBeauty } from './beauty.ts';
import { project } from './camera.ts';
import { fromSrgb } from './lighting.ts';
import { renderPath } from './path/path-hero.ts';
import { contactSheet } from './sheet.ts';

const PALE = 0.4;
const WORN = 0.1;
/** A 30 × 24 m slab in 1 m quads, pale with a worn (4× darker) disc at (6, −4), radius 3 m. */
function ground(): Mesh {
  const tiles: Mesh[] = [];
  for (let x = -15; x < 15; x++)
    for (let y = -12; y < 12; y++) {
      const c = Math.hypot(x + 0.5 - 6, y + 0.5 + 4) < 3 ? WORN : PALE;
      tiles.push(box({ size: [1, 1, 0.1], at: [x + 0.5, y + 0.5, -0.1], color: [c, c, c] }));
    }
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (const t of tiles) {
    const base = positions.length / 3;
    positions.push(...t.positions);
    normals.push(...t.normals);
    uvs.push(...t.uvs);
    colors.push(...t.colors);
    for (const i of t.indices) indices.push(i + base);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
  };
}

/** The ground alone, or under an 11 m hall that makes the scene (and the shot) scene-sized. */
const scene = (hall: boolean): CompiledAsset =>
  compile(
    defineAsset({
      name: 'yard',
      kind: 'scene',
      budget: { triangles: [9999, 9999, 9999] },
      build: (ctx) => {
        ctx.part('ground', ground());
        if (hall)
          ctx.part('hall', box({ size: [10, 12, 11], at: [-9, 0, 0], color: [0.6, 0.5, 0.4] }), {
            parent: 'ground',
          });
      },
    }),
  );

describe('vertex-colour wear on a large ground (rts_faction report)', () => {
  const o = { width: 240, height: 135 };
  const ratio = (a: CompiledAsset, rgba: Uint8Array): number => {
    const cam = cameraFor(a, o);
    const at = (x: number, y: number): number => {
      const s = project(cam, x, y, 0);
      return fromSrgb((rgba[(Math.round(s[1]) * o.width + Math.round(s[0])) * 4] ?? 0) / 255);
    };
    return at(6, -4) / at(8, 8);
  };

  it('the raster hero shows the worn disc as dark in the full scene as on the ground alone', () => {
    const alone = ratio(scene(false), renderBeauty(scene(false), o).rgba);
    const full = ratio(scene(true), renderBeauty(scene(true), o).rgba);
    // Albedo ratio 0.25; specular and the tone curve lift it a little, a flat tone would be 1.
    expect(alone).toBeLessThan(0.45);
    expect(Math.abs(full - alone)).toBeLessThan(0.05);
  });

  it('the path-traced hero does too, denoised', () => {
    const full = scene(true);
    expect(ratio(full, renderPath(full, { ...o, spp: 4 }).rgba)).toBeLessThan(0.45);
  });
});

describe('contact sheet FAR panel brightness (rts_resource report)', () => {
  const dome = (segments: number): CompiledAsset => {
    const profile = Array.from({ length: segments / 2 + 1 }, (_, k): [number, number] => {
      const a = (k / (segments / 2)) * (Math.PI / 2);
      return [Math.cos(a), Math.sin(a)];
    });
    return compile(
      defineAsset({
        name: 'dome',
        kind: 'prop',
        budget: { triangles: [9999, 9999, 9999] },
        build: (ctx) => ctx.part('rock', lathe({ profile, segments, color: [0.3, 0.3, 0.3] })),
      }),
    );
  };
  /** Mean linear value of the pixels the asset drew in panel `i` of a 96 px sheet. */
  const mean = (png: Uint8Array, i: number): number => {
    const img = decodePng(png);
    let sum = 0;
    let n = 0;
    for (let y = 0; y < 96; y++)
      for (let x = 0; x < 96; x++) {
        const p = ((40 + Math.floor(i / 3) * 96 + y) * img.width + (i % 3) * 96 + x) * 4;
        const r = img.data[p] ?? 0;
        if (r === 238 || r === 190 || (y < 30 && x < 80)) continue;
        sum += fromSrgb(r / 255);
        n++;
      }
    return sum / n;
  };

  it('a 6-sided far LOD is lit within 5% of the 48-sided near one', () => {
    const png = contactSheet(dome(48), { cell: 96, far: dome(6) });
    const near = mean(png, 0);
    expect(near).toBeGreaterThan(0.05);
    expect(Math.abs(mean(png, 5) / near - 1)).toBeLessThan(0.05);
  });
});
