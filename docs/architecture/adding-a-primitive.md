# Adding a primitive

**A primitive is a pure function `(options) => Mesh`.** No `ctx`, no parts, no RNG unless a `seed` is an option. It lives in `src/primitives/` (tier 2) and may import `core` and `material` only.

## Checklist

| Step | Rule |
|---|---|
| 1. Signature | If it's in `src/primitives/planned.ts`, keep that exact signature: recipes are already written against it. Move it to its own file, e.g. `tiled.ts` |
| 2. Options | Readonly interface `XOptions`, exported. Sizes in metres. `color: Vec3` (linear), `strip?: StripId` (default `'plain'`), `at?: Vec3` |
| 3. Placement | Base at `at` (z = 0 = ground) unless the shape has a natural centre (axles, `lathe` with `axis`). Say which in the doc comment |
| 4. Geometry | `MeshBuilder`: `vertex({ p, n, uv, color })`, `quad(a, b, c, d)` counter-clockwise from outside |
| 5. UVs | Map into `stripRect(strip)` by world metres, so texel density matches `box` |
| 6. LOD | Take a resolution option (`segments`, `resolution`). The recipe picks it from `ctx.lod`; the primitive never reads LOD |
| 7. Contact | If the shape rests on something, put a vertex at the contact point (see the `lathe` ring offset; the floating-parts gate caught a coarse wheel missing its rail) |
| 8. Export | Named export from `src/primitives/index.ts`; remove it from `planned.ts`' export |
| 9. Test | `x.test.ts` next to it (see `prism.test.ts`): triangle count, bounds, normals point out, deterministic output |
| 10. Use it | Add or update a recipe in `recipes/` that uses it, so `scripts/recipes.ts` gates it |
| 11. Docs | Tick it in [roadmap](../plans/roadmap.md); update [07-what-fits](../idea/07-what-fits.md) if fit changed; add to `CHANGELOG.md` under `[Unreleased]` |

## Skeleton

`tiled` is still in `planned.ts` (M1); this is how it lands. Real shipped references: `prism.ts`, `beam.ts`, `planar.ts`.

```ts
// A quad tiling one trim strip at true scale: walls, roofs, decks.

import { cross, length, type Mesh, MeshBuilder, normalize, type Vec3 } from '../core/index.ts';
import { type StripId, stripRect } from '../material/index.ts';

export interface TiledOptions {
  readonly origin: Vec3;   // one corner
  readonly u: Vec3;        // edge along the strip, metres
  readonly v: Vec3;        // the other edge
  readonly color: Vec3;
  readonly strip: StripId;
}

export function tiled(o: TiledOptions): Mesh {
  const rect = stripRect(o.strip);
  const n = normalize(cross(o.u, o.v));
  const reps = length(o.u) / rect.metres;           // true-scale tiling along U
  const b = new MeshBuilder();
  // 4 vertices: origin, +u, +u+v, +v; uv u from 0 to reps across the strip's rect
  return b.build();
}
```

Done = `bun run verify` green, including the recipe that uses it.
