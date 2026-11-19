// Clear glass at the hero's 16 samples (D401): a pane that mirrors the key light toward the camera
// must show the light's reflection as a patch, not as lone white pixels. Failure case first: the
// speckle count against a 256-sample reference; then the mean against that reference (the split
// adds no light), the same bytes twice, and a white furnace that holds behind glass.

import { describe, expect, it } from 'bun:test';
import {
  type CompiledAsset,
  compile,
  defineAsset,
  translate,
  type Vec3,
} from '../../core/index.ts';
import type { PaintedSheet } from '../../material/index.ts';
import { box, planar } from '../../primitives/index.ts';
import { type PathRender, renderPath } from './path-hero.ts';
import { makeSky } from './sky.ts';

const flat = (rgba: readonly number[]): Uint8Array => {
  const out = new Uint8Array(64);
  for (let i = 0; i < 16; i++) out.set(rgba, i * 4);
  return out;
};
/** White albedo, flat normals, ORM = (1, 0.8, 0). */
const sheet: PaintedSheet = {
  size: 4,
  albedo: flat([255, 255, 255, 255]),
  normal: flat([128, 128, 255, 255]),
  orm: flat([255, 204, 0, 255]),
};

const AZ = 35;
const EL = 25;
const unit = (az: number, el: number): Vec3 => {
  const a = (az * Math.PI) / 180;
  const e = (el * Math.PI) / 180;
  return [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)];
};

/** A 1.4 × 0.9 m pane whose normal bisects the key light (studioRig: az − 50°, el 55°) and the eye. */
function mirrorPane(): ReturnType<typeof planar> {
  const sun = unit(AZ - 50, 55);
  const eye = unit(AZ, EL);
  const hl = Math.hypot(sun[0] + eye[0], sun[1] + eye[1], sun[2] + eye[2]);
  const h: Vec3 = [(sun[0] + eye[0]) / hl, (sun[1] + eye[1]) / hl, (sun[2] + eye[2]) / hl];
  const ul = Math.hypot(h[0], h[1]);
  const u: Vec3 = [-h[1] / ul, h[0] / ul, 0];
  const v: Vec3 = [h[1] * u[2] - h[2] * u[1], h[2] * u[0] - h[0] * u[2], h[0] * u[1] - h[1] * u[0]];
  const at = (a: number, b: number): Vec3 => [
    u[0] * a + v[0] * b,
    u[1] * a + v[1] * b,
    1 + v[2] * b,
  ];
  return planar({
    points: [at(-0.7, -0.45), at(0.7, -0.45), at(0.7, 0.45), at(-0.7, 0.45)],
    color: [1, 1, 1],
  });
}

/** A matt body (dark unless `color` says otherwise), with the clear pane over it or bare. */
const scene = (color: Vec3 = [0.12, 0.12, 0.14], glass = true): CompiledAsset =>
  compile(
    defineAsset({
      name: 'glass_case',
      kind: 'prop',
      budget: { triangles: [glass ? 14 : 12, 14, 14] },
      finishes: { matte: { metallic: 0, roughness: 0.7, specular: { factor: 0 } } },
      build: (ctx) => {
        const body = translate(box({ size: [2, 1.4, 0.5], color }), [0, 0, 0.25]);
        ctx.part('body', body, { finish: 'matte' });
        if (glass) ctx.part('pane', mirrorPane(), { surface: 'glass' });
      },
    }),
  );

const SIZE = { width: 160, height: 90, azDeg: AZ, elDeg: EL, denoise: false } as const;
const shot = (a: CompiledAsset, spp: number): PathRender => renderPath(a, { ...SIZE, spp, sheet });
const lum = (r: PathRender, i: number): number =>
  0.2126 * (r.linear[i * 3] ?? 0) +
  0.7152 * (r.linear[i * 3 + 1] ?? 0) +
  0.0722 * (r.linear[i * 3 + 2] ?? 0);

describe('thin see-through surfaces at 16 samples', () => {
  const glass = scene();
  const draft = shot(glass, 16);
  const ref = shot(glass, 256);

  it('shows the mirrored key light as a patch, not as speckle', () => {
    let lit = 0;
    let speckle = 0;
    let holes = 0;
    for (let i = 0; i < draft.mask.length; i++) {
      if (draft.mask[i] !== 255) continue;
      const r = lum(ref, i);
      const d = lum(draft, i);
      // A lone bright pixel: well over what the pixel converges to.
      if (d > 2 * r + 0.25) speckle++;
      if (r > 2) {
        lit++;
        // A dark pixel inside the light's reflection (white once tone-mapped).
        if (d < 1) holes++;
      }
    }
    // The 2.5° key light, mirrored, covers a patch of this pane at this size.
    expect(speckle).toBeLessThanOrEqual(4);
    expect(lit).toBeGreaterThan(40);
    expect(holes).toBeLessThanOrEqual(lit * 0.05);
  });

  it('keeps the mean radiance of the 256-sample reference', () => {
    let a = 0;
    let b = 0;
    for (let i = 0; i < draft.mask.length; i++)
      if (draft.mask[i] === 255) {
        a += lum(draft, i);
        b += lum(ref, i);
      }
    expect(Math.abs(a / b - 1)).toBeLessThan(0.05);
  });

  it('renders the same bytes twice', () => {
    expect(Buffer.from(shot(glass, 16).rgba).equals(Buffer.from(draft.rgba))).toBe(true);
  });

  it('white furnace: a white box behind clear glass under a uniform white sky stays radiance 1', () => {
    // Glass passes or mirrors all of a uniform sky, and the box returns all of it: any other
    // answer counts some light twice (once sampled as a light, once found through the pane).
    const sky = makeSky({
      sun: [0, 0, 1],
      sunColor: [0, 0, 0],
      zenith: [1, 1, 1],
      horizon: [1, 1, 1],
      ground: [1, 1, 1],
    });
    const o = { ...SIZE, spp: 64, sheet, sky, floor: false };
    const cased = scene([1, 1, 1]);
    const r = renderPath(cased, o);
    // Where the box is (the same camera without the pane): glass alone shows the backdrop.
    const body = renderPath(scene([1, 1, 1], false), { ...o, spp: 1, frameFrom: cased }).mask;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < r.mask.length; i++)
      if (body[i] === 255) {
        sum += lum(r, i);
        n++;
      }
    expect(n).toBeGreaterThan(2000);
    expect(Math.abs(sum / n - 1)).toBeLessThan(0.01);
  });
});
