// A textured part in every renderer: without its set sampled the quad would be vertex-colour
// white; with it the four checker texels show in the raster beauty, the path tracer and the
// contact sheet. The normal map follows the GLB convention (green up, v down, mirrored islands).

import { describe, expect, it } from 'bun:test';
import {
  type Bone,
  type CompiledAsset,
  compile,
  defineAsset,
  quatFromAxisAngle,
} from '../core/index.ts';
import type { PaintedSheet } from '../material/index.ts';
import { skinWeights, weightBonesOf } from '../passes/index.ts';
import { renderBeauty } from './beauty.ts';
import { renderPath, renderPathThreaded } from './path/path-hero.ts';
import { makeSky } from './path/sky.ts';
import { posedAsset } from './pose-strip.ts';
import { drawAsset, orthoCamera, type Target } from './raster.ts';
import { sceneOf } from './scene.ts';
import { SET_OUT, setSurface } from './set-shade.ts';
import { CHECKER, checker, png, quad, textured, tilt } from './texture-set-fixtures.ts';

const flat = (rgba: readonly number[]): Uint8Array => {
  const out = new Uint8Array(64);
  for (let i = 0; i < 16; i++) out.set(rgba, i * 4);
  return out;
};
/** The trim sheet is irrelevant to a textured part: a 4² white one keeps the tests fast. */
const sheet: PaintedSheet = {
  size: 4,
  albedo: flat([255, 255, 255, 255]),
  normal: flat([128, 128, 255, 255]),
  orm: flat([255, 204, 0, 255]),
};
const W = 64;
/** Pixel centres of the quad's quadrants in a W × W front view: image order, like CHECKER. */
const SPOTS = [
  [20, 20],
  [44, 20],
  [20, 44],
  [44, 44],
] as const;
const at = (rgba: Uint8Array, x: number, y: number): number[] => [
  ...rgba.subarray((y * W + x) * 4, (y * W + x) * 4 + 3),
];
/** Which of red / green / blue / white a pixel reads as. */
const reads = (p: readonly number[]): number => {
  const [r, g, b] = [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
  const lo = Math.min(r, g, b);
  if (lo > 0.6 * Math.max(r, g, b)) return 3;
  return r > g && r > b ? 0 : g > b ? 1 : 2;
};
const quadrants = (rgba: Uint8Array): number[] => SPOTS.map(([x, y]) => reads(at(rgba, x, y)));

const front = { width: W, height: W, azDeg: 0, elDeg: 0, supersample: 1, sheet } as const;
const sheetView = (asset: CompiledAsset): Uint8Array => {
  const t: Target = {
    px: new Uint8Array(W * W * 4),
    depth: new Float32Array(W * W).fill(Infinity),
    width: W,
    height: W,
  };
  drawAsset(t, orthoCamera({ label: 'f', dir: [-1, 0, 0], up: [0, 0, 1] }, [0, 0, 0], 1, W), asset);
  return t.px;
};
const sky = makeSky({
  sun: [0.6, 0, 0.8],
  sunColor: [0, 0, 0],
  zenith: [1, 1, 1],
  horizon: [1, 1, 1],
  ground: [1, 1, 1],
});
const traced = (asset: CompiledAsset): Uint8Array =>
  renderPath(asset, { ...front, spp: 8, sky, floor: false, denoise: false }).rgba;

describe('textured parts render textured', () => {
  const card = textured({ name: 'skin', albedo: checker() });

  it('the checker shows its four texels in the raster, the path tracer and the sheet', () => {
    expect(CHECKER).toHaveLength(4);
    expect(quadrants(renderBeauty(card, front).rgba)).toEqual([0, 1, 2, 3]);
    expect(quadrants(traced(card))).toEqual([0, 1, 2, 3]);
    expect(quadrants(sheetView(card))).toEqual([0, 1, 2, 3]);
  });

  it('vertex colour multiplies the albedo', () => {
    const red = textured({ name: 'skin', albedo: checker() }, { colour: [1, 0, 0] });
    // Green and blue texels go black, white goes red.
    for (const rgba of [renderBeauty(red, front).rgba, sheetView(red)]) {
      const [, g, , w] = SPOTS.map(([x, y]) => at(rgba, x, y));
      // Only the sky's specular is left on the green texel.
      expect(reads(g ?? [0, 255, 0])).not.toBe(1);
      expect(Math.max(...(g ?? [255]))).toBeLessThan(90);
      expect(reads(w ?? [])).toBe(0);
    }
  });

  it('a cutout part drops the texels under the alpha cut', () => {
    const holed = textured(
      { name: 'skin', albedo: png(2, (x) => [255, 0, 0, x ? 255 : 0]) },
      { surface: 'cutout' },
    );
    const r = renderBeauty(holed, front);
    expect(r.mask[20 * W + 20]).toBe(0);
    expect(r.mask[20 * W + 44]).toBe(255);
    const px = sheetView(holed);
    expect(px[(20 * W + 20) * 4 + 3]).toBe(0);
    expect(px[(20 * W + 44) * 4 + 3]).toBe(255);
    const path = renderPath(holed, { ...front, spp: 4, floor: false });
    expect(path.mask[20 * W + 20]).toBe(0);
    expect(path.mask[20 * W + 44]).toBe(255);
  });

  it('the ORM map and the factors reach the shader', () => {
    const rough = textured({ name: 'skin', albedo: checker(), roughness: 1 });
    const mirror = textured({ name: 'skin', albedo: checker(), roughness: 0.1, metallic: 1 });
    const viaMap = textured({ name: 'skin', albedo: checker(), orm: png(4, () => [255, 26, 255]) });
    const a = renderBeauty(rough, front).rgba;
    expect(renderBeauty(mirror, front).rgba).not.toEqual(a);
    // roughness 26/255 ≈ 0.1, metallic 1 from the map = the same factors.
    expect(at(renderBeauty(viaMap, front).rgba, 44, 44)).toEqual(
      at(renderBeauty(mirror, front).rgba, 44, 44),
    );
  });
});

describe('textured parts through the other pipelines', () => {
  it('worker threads read the same sets: threaded bytes equal the in-line render', async () => {
    const card = textured({ name: 'skin', albedo: checker(), normal: tilt(0.3, 0.2) });
    const o = { ...front, spp: 4, floor: false } as const;
    const threaded = await renderPathThreaded(card, { ...o, threads: 2 });
    expect(threaded.rgba).toEqual(renderPath(card, o).rgba);
    expect(quadrants(threaded.rgba)).toEqual([0, 1, 2, 3]);
  });

  it('a posed (skinned) part keeps its UVs and its set', () => {
    const bones: Bone[] = [{ name: 'root', head: [0, 0, -0.5], tail: [0, 0, 0.5] }];
    const set = { name: 'skin', albedo: checker() };
    const skinned = compile(
      defineAsset({
        name: 'flag',
        kind: 'prop',
        budget: { triangles: [2, 2, 2], textureSets: { count: 1, size: 1024 } },
        build(ctx) {
          for (const b of bones) ctx.bone(b.name, b);
          ctx.part('flag', skinWeights(quad(), weightBonesOf(bones), { blend: 0.05 }), {
            textures: set,
          });
        },
      }),
    );
    const posed = posedAsset(skinned, {
      label: 'turned',
      joints: new Map([['root', { head: [0, 0, -0.5], rot: quatFromAxisAngle([0, 0, 1], 0.4) }]]),
    });
    const s = sceneOf(posed);
    expect(posed.parts[0]?.mesh?.positions).not.toEqual(skinned.parts[0]?.mesh?.positions);
    expect([...s.texSet]).toEqual([1, 1]);
    expect(s.uvs).toEqual(sceneOf(skinned).uvs);
    // The tangent frame turns with the pose: still unit, no longer +Y.
    expect(s.vtan[1]).toBeCloseTo(Math.cos(0.4), 4);
    expect(s.vtan[0]).toBeCloseTo(-Math.sin(0.4), 4);
  });
});

describe('normal map convention', () => {
  /** Shading normal at the quad's centre under a (r, g) tangent-space tilt. */
  const bent = (r: number, g: number, mirror = false, side = 1): number[] => {
    const s = sceneOf(
      textured({ name: 'skin', albedo: checker(), normal: tilt(r, g) }, { mirror }),
    );
    const set = s.sets[0];
    if (!set) throw new Error('fixture has no set');
    setSurface(set, s.vtan, 0, 2, 1, 0.5, 0.5, 0, 0.5, 0.5, 0, side, 0, 0, side, SET_OUT);
    return [...SET_OUT.subarray(0, 3)];
  };
  const near = (got: readonly number[], want: readonly number[]): void =>
    want.forEach((w, k) => {
      expect(got[k]).toBeCloseTo(w, 1);
    });

  it('a flat map leaves the normal alone (to the 8-bit rounding of 128)', () => {
    near(bent(0, 0), [1, 0, 0]);
    const plain = renderBeauty(textured({ name: 'skin', albedo: checker() }), front).rgba;
    const flat = renderBeauty(
      textured({ name: 'skin', albedo: checker(), normal: tilt(0, 0) }),
      front,
    ).rgba;
    let worst = 0;
    for (let i = 0; i < plain.length; i++)
      worst = Math.max(worst, Math.abs((plain[i] ?? 0) - (flat[i] ?? 0)));
    expect(worst).toBeLessThanOrEqual(2);
  });

  it('red tilts along +U, green tilts UP the image (decreasing v)', () => {
    near(bent(0.5, 0), [0.866, 0.5, 0]);
    near(bent(0, 0.5), [0.866, 0, 0.5]);
    near(bent(0, -0.5), [0.866, 0, -0.5]);
  });

  it('a mirrored island flips red with its U axis and keeps green up', () => {
    near(bent(0.5, 0, true), [0.866, -0.5, 0]);
    near(bent(0, 0.5, true), [0.866, 0, 0.5]);
  });

  it('a back face mirrors the frame (red and the normal flip, green follows)', () => {
    near(bent(0.5, 0, false, -1), [-0.866, -0.5, 0]);
    near(bent(0, 0.5, false, -1), [-0.866, 0, -0.5]);
  });

  it('a map tilted toward the light shades brighter, away darker, in every renderer', () => {
    const lum = (rgba: Uint8Array): number => at(rgba, 44, 44).reduce((s, v) => s + v, 0);
    const of = (g: number): CompiledAsset =>
      textured({ name: 'skin', albedo: png(2, () => [200, 200, 200]), normal: tilt(0, g) });
    // The sheet's light and the studio key both come from above (+Z = image up = green up).
    for (const view of [sheetView, (a: CompiledAsset) => renderBeauty(a, front).rgba]) {
      const [down, flat, up] = [-0.5, 0, 0.5].map((g) => lum(view(of(g))));
      expect(up ?? 0).toBeGreaterThan((flat ?? 0) + 8);
      expect(flat ?? 0).toBeGreaterThan((down ?? 0) + 8);
    }
    const topLit = makeSky({
      sun: [0, 0, 1],
      sunColor: [0, 0, 0],
      zenith: [1, 1, 1],
      horizon: [0.2, 0.2, 0.2],
      ground: [0, 0, 0],
    });
    const path = (g: number): number =>
      lum(renderPath(of(g), { ...front, spp: 32, sky: topLit, floor: false, denoise: false }).rgba);
    expect(path(0.5)).toBeGreaterThan(path(-0.5) + 8);
  });
});
