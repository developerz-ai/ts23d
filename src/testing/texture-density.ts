// assertTexelDensity: the trim sheet lands on every part at a consistent sharpness. Per part, the
// area-weighted texels per metre (√(UV area × sheet² ÷ world area)) must fall in a range — a part
// far below it looks blurry next to its neighbours, far above it wastes the sheet or shimmers.
// Triangles with no UV area (pure vertex colour) are skipped.
//   it('texel density is even', () => assertTexelDensity(tank, [256, 2048]));

import type { Asset, Mesh } from '../core/index.ts';
import { TRIM_SHEET_SIZE } from '../material/index.ts';
import { compileLods, failOn, type LodOptions } from './compiled.ts';
import type { Range } from './measure.ts';
import { corners, cross3, meshesOf, sub3 } from './mesh-input.ts';

export interface TexelOptions extends LodOptions {
  /** Sheet edge in pixels. Default TRIM_SHEET_SIZE (4096). */
  readonly sheet?: number;
}

/** Area-weighted texels per metre of one mesh, or null when nothing is UV mapped. */
export function texelDensity(m: Mesh, sheet = TRIM_SHEET_SIZE): number | null {
  let world = 0;
  let texels = 0;
  for (let t = 0; t < m.indices.length / 3; t++) {
    const [a, b, c] = corners(m, t);
    const area = Math.hypot(...cross3(sub3(b, a), sub3(c, a))) / 2;
    const uv = (k: number, j: number): number => m.uvs[(m.indices[t * 3 + k] ?? 0) * 2 + j] ?? 0;
    const uvArea =
      Math.abs(
        (uv(1, 0) - uv(0, 0)) * (uv(2, 1) - uv(0, 1)) -
          (uv(2, 0) - uv(0, 0)) * (uv(1, 1) - uv(0, 1)),
      ) / 2;
    if (area < 1e-10 || uvArea < 1e-14) continue;
    world += area;
    texels += uvArea * sheet * sheet;
  }
  return world > 0 ? Math.sqrt(texels / world) : null;
}

/** Each UV-mapped part's texel density within `range` px/m at every LOD checked (default LOD0). */
export function assertTexelDensity(asset: Asset, range: Range, o: TexelOptions = {}): number[] {
  const seen: number[] = [];
  failOn(
    `${asset.name} texel density`,
    compileLods(asset, { lods: [0], ...o }).flatMap((c) =>
      meshesOf(c).flatMap(({ name, mesh }) => {
        const d = texelDensity(mesh, o.sheet);
        if (d === null) return [];
        seen.push(d);
        if (d >= range[0] && d <= range[1]) return [];
        return [
          {
            lod: c.lod,
            finding: {
              gate: 'texel-density',
              code: 'T3D_QA_TEXEL_DENSITY',
              part: name,
              message: `'${name}' gets ${d.toFixed(0)} px/m, want ${range[0]}–${range[1]} px/m`,
              fix:
                d < range[0]
                  ? `UVs are stretched: map '${name}' with world-scaled UVs (the primitive's strip span), not one strip across the whole part`
                  : `UVs are squeezed: '${name}' repeats the strip too densely — check its UV scale/span`,
            },
          },
        ];
      }),
    ),
  );
  return seen;
}
