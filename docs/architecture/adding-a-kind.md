# Adding a kind

**A kind is a library of builder functions `(ctx, options) => void | value`.** Builders add named parts to the caller's `ctx`; the recipe keeps control of layout, naming and LOD. It lives in `src/kinds/` (tier 3) and may import `core`, `grammar`, `material`, `primitives`, `neural`, `passes`.

## Checklist

| Step | Rule |
|---|---|
| 1. Signature | If it's in `src/kinds/planned.ts` (`hull`, `tree`, `roof`, `creature`), keep that signature. Move it to `vessel.ts`, `vegetation.ts`, … |
| 2. Domain params | Take the parameters the domain uses: Whyte `2-6-2`, length/beam/draft, species + height, roof pitch in degrees. Not raw coordinates |
| 3. Names | Every part prefixed by a caller-supplied `prefix`/`name`. Follow the engine contract: `axle_*` / `wheel_*` spin about Y, `prop_*` / `rotor_*` about their own axis, `door_*` hinge at the pivot |
| 4. Pivots | Movable pieces get a `ctx.group` at the hinge, the mesh inside it. Yaw on the group, motion on the child |
| 5. LOD | Read `ctx.lod`: drop details, lower segments. Masses survive to LOD2 |
| 6. Randomness | Only `ctx.rng.fork('<kind>:<prefix>')`, so adding the kind doesn't shift other draws |
| 7. Real units | Defaults from real references, cited in a comment (e.g. standard gauge 1.435 m) |
| 8. Export | Named export from `src/kinds/index.ts` |
| 9. Test | Next to it: part names, part count per LOD, QA passes on a minimal asset using it |
| 10. Recipe | At least one `recipes/*.ts` using it. Its contact sheet is the review artefact |
| 11. Docs | [09-kinds](../idea/09-kinds.md), [07-what-fits](../idea/07-what-fits.md), [roadmap](../plans/roadmap.md), `CHANGELOG.md` |

## Shape

```ts
// Vessel helpers: hulls from naval-architecture params, lofted from sections.

import type { BuildContext, Vec3 } from '../core/index.ts';
import { loft } from '../primitives/index.ts';

export interface HullOptions {
  readonly length: number;    // LOA, metres
  readonly beam: number;
  readonly draft: number;
  readonly freeboard: number;
  readonly color: Vec3;
}

export function hull(ctx: BuildContext, o: HullOptions): void {
  const stations = [24, 12, 6][ctx.lod] ?? 6;
  // sections from sheer + keel curves → loft → ctx.part('hull', …)
}
```

A kind that needs a missing primitive adds the primitive first ([adding-a-primitive.md](adding-a-primitive.md)), in its own PR.
