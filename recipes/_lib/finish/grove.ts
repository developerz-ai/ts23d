// Shared finish for the tree recipes (oak, pine, palm): the `tree` kind grows the botany; this
// moves its bark from the classic `wood` strip onto the species' bark strip (the kind's height
// gradient kept as a soft tint), greens the north (+Y), shaded lower trunk with moss, and lays a
// ground patch of the species' floor (leaf litter, needles, sand) under the crown.

import {
  BUDGETS,
  type BuildContext,
  defineAsset,
  hex,
  type Mesh,
  materialVariant,
  planar,
  type RealDimensions,
  type StripId,
  stripAtV,
  stripRect,
  tree,
  treeReal,
  type Vec3,
  valueNoise,
} from '@developerz.ai/ts23d';
import { reproject, tessellate } from './finish.ts';

export interface GroveSpec {
  readonly name: string;
  readonly description: string;
  readonly sources: readonly string[];
  readonly species: 'oak' | 'pine' | 'palm';
  readonly size: { readonly height: number; readonly spread: number; readonly dbh: number };
  readonly bark: StripId;
  /** Moss on the north side of the lower trunk, 0..1. */
  readonly moss: number;
  /** Floor under the crown and its radius (m). */
  readonly floor: StripId;
  readonly floorRadius: number;
  readonly floorTint?: Vec3;
  readonly source: string;
}

const MOSS: Vec3 = [0.22, 0.32, 0.08];

/** Bark: strip swap on `wood` vertices, kind's tint normalised toward white, moss to the north. */
function barkOf(m: Mesh, bark: StripId, moss: number, noise: (p: Vec3) => number): Mesh {
  const uvs = new Float32Array(m.uvs);
  const colors = new Float32Array(m.colors);
  const wood = stripRect('wood');
  const to = stripRect(bark);
  for (let i = 0; i < m.positions.length / 3; i++) {
    // Inclusive band: a sweep's seam column and cap rims sit exactly on wood.v1, which stripAtV
    // reads as the next strip (left a grey streak down the trunk).
    const v = m.uvs[i * 2 + 1] ?? 0;
    if (stripAtV(v) !== 'wood' && !(v >= wood.v0 && v <= wood.v1)) continue;
    uvs[i * 2] = to.u0 + ((uvs[i * 2] ?? 0) - wood.u0) * (wood.metres / to.metres);
    uvs[i * 2 + 1] = to.v0 + ((m.uvs[i * 2 + 1] ?? 0) - wood.v0);
    const c: Vec3 = [colors[i * 3] ?? 0, colors[i * 3 + 1] ?? 0, colors[i * 3 + 2] ?? 0];
    const top = Math.max(...c, 1e-3);
    let out: Vec3 = [
      0.55 + 0.45 * (c[0] / top),
      0.55 + 0.45 * (c[1] / top),
      0.55 + 0.45 * (c[2] / top),
    ];
    const p: Vec3 = [
      m.positions[i * 3] ?? 0,
      m.positions[i * 3 + 1] ?? 0,
      m.positions[i * 3 + 2] ?? 0,
    ];
    const north = m.normals[i * 3 + 1] ?? 0;
    const low = Math.max(0, 1 - p[2] / 4);
    const w = moss * Math.max(0, north) * low * (0.6 + 0.4 * noise(p));
    if (w > 0)
      out = [
        out[0] + (MOSS[0] - out[0]) * w,
        out[1] + (MOSS[1] - out[1]) * w,
        out[2] + (MOSS[2] - out[2]) * w,
      ];
    colors.set(out, i * 3);
  }
  return { ...m, uvs, colors };
}

export function grove(o: GroveSpec) {
  const real: RealDimensions = treeReal({ ...o.size, source: o.source });
  const [b0, b1, b2] = BUDGETS.tree.triangles;
  return defineAsset({
    name: o.name,
    kind: 'vegetation',
    tags: ['vegetation', 'tree', o.species],
    description: o.description,
    sources: [...o.sources],
    real,
    // The kind's tree budget plus the ground patch (≤ 400 / 200 / 16 triangles).
    budget: { triangles: [b0 + 400, b1 + 200, b2 + 16] },
    build(ctx: BuildContext) {
      const noise = valueNoise(ctx.rng.fork('moss'), { scale: 0.4, octaves: 2 });
      // The kind emits through ctx.part: intercept to re-material the bark on the way out.
      const wrapped: BuildContext = Object.create(ctx);
      wrapped.part = (name, mesh, opts) =>
        ctx.part(
          name,
          mesh && /trunk|roots|branches/.test(name) ? barkOf(mesh, o.bark, o.moss, noise) : mesh,
          opts,
        );
      tree(wrapped, { species: o.species, ...o.size });
      // Floor patch: a polygon split into small triangles and box-projected so the strip keeps
      // true scale (a cylinder cap or planar UV would wrap V inside a triangle).
      const n = ctx.pick([16, 10, 6]);
      const disc = planar({
        points: Array.from({ length: n }, (_, k): Vec3 => {
          const a = (k / n) * Math.PI * 2;
          return [Math.cos(a) * o.floorRadius, Math.sin(a) * o.floorRadius, 0.005];
        }),
        color: o.floorTint ?? hex('#ffffff'),
        strip: materialVariant(o.floor, 5),
      });
      ctx.part('ground', ctx.lod === 2 ? disc : reproject(tessellate(disc, o.floorRadius / 3)));
    },
  });
}
