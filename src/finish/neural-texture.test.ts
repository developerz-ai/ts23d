import { describe, expect, it } from 'bun:test';
import type { Mesh, Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import { sdf } from '../primitives/index.ts';
import {
  closestColour,
  closestTexture,
  delight,
  highPassOver,
  projectViews,
  transferColours,
  turnaroundCameras,
} from './neural-texture.ts';

/** CIE76 ΔE between two linear-RGB colours. */
function deltaE(a: Vec3, b: Vec3): number {
  const lab = (c: Vec3): Vec3 => {
    const [r, g, bl] = c;
    const x = (0.4124 * r + 0.3576 * g + 0.1805 * bl) / 0.95047;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    const z = (0.0193 * r + 0.1192 * g + 0.9505 * bl) / 1.08883;
    const f = (t: number): number => (t > 0.008856 ? dmath.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  };
  const [p, q] = [lab(a), lab(b)];
  return dmath.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

const cubeField =
  (h: number) =>
  (p: Vec3): number => {
    const q = p.map((x) => Math.abs(x) - h);
    return dmath.norm(q.map((x) => Math.max(x, 0))) + Math.min(Math.max(...q), 0);
  };
/** The source's albedo: smooth gradients over the cube. */
const albedo = (p: Vec3): Vec3 => [
  0.2 + 0.5 * (p[0] + 0.5),
  0.3 + 0.4 * (p[2] + 0.5),
  0.6 - 0.3 * (p[1] + 0.5),
];
const cube = (res: number, colour: (p: Vec3) => Vec3): Mesh =>
  sdf({
    field: cubeField(0.5),
    bounds: [
      [-0.6, -0.6, -0.6],
      [0.6, 0.6, 0.6],
    ],
    resolution: res,
    color: colour,
  });

describe('model texture → our surface (closest point)', () => {
  const source = cube(0.02, albedo);
  const target = cube(0.07, () => [0.5, 0.5, 0.5]);

  it('a cube takes the source texture within ΔE 3 at every vertex', () => {
    const got = transferColours(target, closestColour(source));
    let worst = 0;
    for (let i = 0; i < got.length; i += 3) {
      const p: Vec3 = [
        target.positions[i] ?? 0,
        target.positions[i + 1] ?? 0,
        target.positions[i + 2] ?? 0,
      ];
      worst = Math.max(worst, deltaE([got[i] ?? 0, got[i + 1] ?? 0, got[i + 2] ?? 0], albedo(p)));
    }
    expect(worst).toBeLessThan(3);
  });

  it('high-pass keeps the recipe colour: a smooth source changes the mean by < ΔE 1', () => {
    const got = transferColours(target, closestColour(source));
    const out = highPassOver(target, got, { iterations: 6 });
    const mean = (a: Float32Array): Vec3 => {
      const s = [0, 0, 0];
      for (let i = 0; i < a.length; i++) s[i % 3] = (s[i % 3] ?? 0) + (a[i] ?? 0) / (a.length / 3);
      return s as unknown as Vec3;
    };
    expect(deltaE(mean(out), [0.5, 0.5, 0.5])).toBeLessThan(1);
  });

  it('high-pass passes a speck the smoothing cannot reach', () => {
    const speck = transferColours(target, (p) =>
      p[0] > 0.49 && Math.abs(p[1]) < 0.05 && Math.abs(p[2]) < 0.05 ? [1, 1, 1] : [0.5, 0.5, 0.5],
    );
    const out = highPassOver(target, speck, { iterations: 4 });
    expect(Math.max(...out)).toBeGreaterThan(0.75);
  });

  it('de-lights by the irradiance, floored', () => {
    expect(
      [...delight(Float32Array.of(0.2, 0.2, 0.2), Float32Array.of(0.5))].map((x) => +x.toFixed(3)),
    ).toEqual([0.4, 0.4, 0.4]);
    expect(delight(Float32Array.of(0.2, 0.2, 0.2), Float32Array.of(0))[0]).toBeCloseTo(0.8, 6);
  });
});

describe('multi-view projection (12 views round the turnaround)', () => {
  const target = cube(0.07, () => [0.5, 0.5, 0.5]);
  const size = 64;
  // Each view sees the face it looks at: paint the whole image that face's colour.
  const faceOf = (az: number): Vec3 =>
    az === 0 ? [1, 0, 0] : az === 90 ? [0, 1, 0] : az === 180 ? [0, 0, 1] : [1, 1, 0];
  const views = turnaroundCameras([0, 0, 0], 1, size, 4).map(({ azDeg, camera }) => {
    const c = faceOf(azDeg).map((x) => Math.round(x * 255));
    const rgba = new Uint8Array(size * size * 4);
    for (let k = 0; k < size * size; k++) rgba.set([c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, 255], k * 4);
    return { rgba, width: size, height: size, camera };
  });
  const got = projectViews(target, views);
  const at = (p: Vec3): Vec3 => {
    let best = 0;
    let d = Infinity;
    for (let i = 0; i < target.positions.length; i += 3) {
      const e = dmath.hypot(
        (target.positions[i] ?? 0) - p[0],
        (target.positions[i + 1] ?? 0) - p[1],
        (target.positions[i + 2] ?? 0) - p[2],
      );
      if (e < d) [d, best] = [e, i];
    }
    return [got[best] ?? 0, got[best + 1] ?? 0, got[best + 2] ?? 0];
  };

  it('a face takes the view that looks straight at it; hidden faces take none', () => {
    expect(at([0.5, 0, 0]).map((x) => +x.toFixed(2))).toEqual([1, 0, 0]);
    expect(at([0, 0.5, 0]).map((x) => +x.toFixed(2))).toEqual([0, 1, 0]);
    expect(at([-0.5, 0, 0]).map((x) => +x.toFixed(2))).toEqual([0, 0, 1]);
    expect(Number.isNaN(at([0, 0, 0.5])[0])).toBe(true);
  });
});

describe('closestTexture: the source image at the closest point', () => {
  // A unit quad in z = 0, UV = (x, y); a 2×2 image: red, green / blue, white (sRGB 255).
  const quad: Mesh = {
    positions: Float32Array.from([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
    normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: Float32Array.from([0, 0, 1, 0, 1, 1, 0, 1]),
    colors: new Float32Array(12).fill(0.5),
    indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
  };
  const img = {
    width: 2,
    height: 2,
    data: Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]),
  };

  it('reads each texel at its centre from above the surface, not the vertex colour', () => {
    const at = closestTexture(quad, img);
    expect(at([0.25, 0.25, 0.3])).toEqual([1, 0, 0]);
    expect(at([0.75, 0.25, -0.2])).toEqual([0, 1, 0]);
    expect(at([0.25, 0.75, 0.1])).toEqual([0, 0, 1]);
    expect(at([0.75, 0.75, 0.1])).toEqual([1, 1, 1]);
    // Between texels: half red, half green, blended as stored (sRGB) then made linear.
    const mid = at([0.5, 0.25, 0.1]);
    expect(mid[0]).toBeCloseTo(0.214, 3);
    expect(mid[1]).toBeCloseTo(0.214, 3);
  });
});
