// Test fixture for textured parts (ADR 016): a 1 m quad facing +X whose UVs are glTF UVs (u along
// +Y, v DOWN the image = −Z), PNG maps from a few texels, and the asset that carries them.

import {
  type CompiledAsset,
  compile,
  defineAsset,
  encodePng,
  type Mesh,
  type Surface,
  type TextureSet,
} from '../core/index.ts';

type Rgb = readonly [number, number, number];

/** A `size`² PNG whose texel (x, y) is `at(x, y)` (RGB or RGBA bytes). */
export function png(size: number, at: (x: number, y: number) => readonly number[]): Uint8Array {
  const px = new Uint8Array(size * size * 4).fill(255);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) px.set(at(x, y), (y * size + x) * 4);
  return encodePng(size, size, px);
}

/** Red, green / blue, white: one texel per quadrant. */
export const CHECKER: readonly Rgb[] = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 255],
];
export const checker = (): Uint8Array => png(2, (x, y) => CHECKER[y * 2 + x] ?? [0, 0, 0]);

/** A normal map of one direction: tangent-space (r, g) in −1…1, glTF encoding. */
export const tilt = (r: number, g: number): Uint8Array => {
  const b = Math.sqrt(Math.max(0, 1 - r * r - g * g));
  return png(4, () => [r, g, b].map((v) => Math.round((v * 0.5 + 0.5) * 255)));
};

/** The quad: `mirror` flips U (a mirrored UV island: handedness −1). */
export function quad(colour: Rgb = [1, 1, 1], mirror = false): Mesh {
  const corners = [
    [-0.5, 0.5],
    [0.5, 0.5],
    [0.5, -0.5],
    [-0.5, -0.5],
  ] as const;
  return {
    positions: new Float32Array(corners.flatMap(([y, z]) => [0, y, z])),
    normals: new Float32Array(corners.flatMap(() => [1, 0, 0])),
    uvs: new Float32Array(corners.flatMap(([y, z]) => [mirror ? 0.5 - y : y + 0.5, 0.5 - z])),
    colors: new Float32Array(corners.flatMap(() => colour)),
    indices: new Uint32Array([0, 2, 1, 0, 3, 2]),
  };
}

export interface FixtureOptions {
  readonly surface?: Surface;
  readonly colour?: Rgb;
  readonly mirror?: boolean;
}

/** The compiled one-part asset `card` with `textures` on the quad. */
export function textured(textures: TextureSet, o: FixtureOptions = {}): CompiledAsset {
  return compile(
    defineAsset({
      name: 'card',
      kind: 'prop',
      budget: { triangles: [2, 2, 2], textureSets: { count: 1, size: 1024 } },
      build: (ctx) =>
        ctx.part('card', quad(o.colour, o.mirror), {
          textures,
          ...(o.surface ? { surface: o.surface } : {}),
        }),
    }),
  );
}
