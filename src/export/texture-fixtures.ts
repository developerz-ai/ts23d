// Test fixtures for textured parts (ADR 016): tiny PNG maps, a UV-mapped plate (glTF UVs: V down,
// so the image's top row is the plate's +Z edge), and `beast`: a skinned plate carrying its own
// texture set next to a trim-sheet prop, its detail gated by LOD. Not exported publicly.

import {
  type Asset,
  type Bone,
  defineAsset,
  encodePng,
  type Mesh,
  MeshBuilder,
  type TextureSet,
  type Vec3,
} from '../core/index.ts';
import { skinWeights, weightBonesOf } from '../passes/index.ts';
import { box } from '../primitives/index.ts';

/** A `size`² RGBA checker of `a` / `b` (0..255), `cells` squares across; `alpha` on `b`. */
export function checkerPng(size: number, a: Vec3, b: Vec3, cells = 4, alpha = 255): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const on = (Math.floor((x * cells) / size) + Math.floor((y * cells) / size)) % 2 === 0;
      px.set(on ? [...a, 255] : [...b, alpha], (y * size + x) * 4);
    }
  return encodePng(size, size, px);
}

export const albedo = checkerPng(8, [255, 40, 40], [240, 240, 240]);
export const normal = checkerPng(8, [128, 128, 255], [150, 128, 250]);
export const orm = checkerPng(8, [255, 200, 0], [255, 90, 0]);
export const hide: TextureSet = { name: 'hide', albedo, normal, orm, credit: 'test model, CC0' };

/** An X × Z plate facing −Y, `n`×`n` quads, UVs 0..1 scaled by `uvScale` (2 = leaves the atlas). */
export function plate(
  n: number,
  color: Vec3 = [1, 1, 1],
  uvScale = 1,
  size: Vec3 = [1, 0, 1],
): Mesh {
  const b = new MeshBuilder();
  const at = (i: number, k: number): number =>
    b.vertex({
      p: [(i / n) * size[0], 0, (k / n) * size[2]],
      n: [0, -1, 0],
      uv: [(i / n) * uvScale, (1 - k / n) * uvScale],
      color,
    });
  for (let i = 0; i < n; i++)
    for (let k = 0; k < n; k++) b.quad(at(i, k), at(i + 1, k), at(i + 1, k + 1), at(i, k + 1));
  return b.build();
}

const BONES: readonly Bone[] = [
  { name: 'root', head: [0, 0, 0.5], tail: [0.5, 0, 0.5] },
  { name: 'tip', parent: 'root', head: [0.5, 0, 0.5], tail: [1, 0, 0.5] },
];

export interface BeastOptions {
  readonly set?: TextureSet;
  /** Vertex colour of the textured plate (white = albedo unchanged). */
  readonly tint?: Vec3;
  readonly uvScale?: number;
  /** The set LOD2 uses instead (same name, other bytes = an error). */
  readonly lod2Set?: TextureSet;
}

/** A skinned textured plate (`skin`) + a trim-sheet box (`crate`); 8 / 4 / 2 quads a side. */
export const beast = (o: BeastOptions = {}): Asset =>
  defineAsset({
    name: 'beast',
    kind: 'creature',
    budget: { triangles: [999, 999, 999], textureSets: { count: 2, size: 1024 } },
    build(ctx) {
      for (const { name, ...b } of BONES) ctx.bone(name, b);
      const mesh = plate(ctx.pick([8, 4, 2]), o.tint, o.uvScale);
      const set = (ctx.lod === 2 ? o.lod2Set : undefined) ?? o.set ?? hide;
      ctx.part('skin', skinWeights(mesh, weightBonesOf(BONES), { blend: 0.05 }), {
        textures: set,
      });
      ctx.part(
        'crate',
        box({ size: [0.2, 0.2, 0.2], at: [0.5, 0.3, 0.1], color: [0.5, 0.4, 0.3] }),
      );
    },
  });
