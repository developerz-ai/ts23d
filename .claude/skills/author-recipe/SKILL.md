---
name: author-recipe
description: The closed agent loop for writing a ts23d asset recipe in TypeScript — research real dimensions, block out masses, compile until QA PASS, render a six-view contact sheet, READ it, add LOD-gated detail, grime, iterate. Use whenever creating or improving anything in recipes/.
---

# Authoring a recipe

The human names a thing; you research it (specs + real photos) into `refs/<name>.md`; then you build
it here; the gates prove the model matches the research.

A recipe is a TypeScript module exporting one `defineAsset(...)`. It is code: loops, helpers,
`ctx.use` composition, `ctx.lod` gating. Never JSON.

## Skeleton

```ts
// <Name> — <one line>. Real: L × W × H m. Sources below.
import { beam, box, defineAsset, grime, hex, lathe, merge, place, prism } from '@developerz-ai/ts23d';

const paint = hex('#4b5320');

export const my_asset = defineAsset({
  name: 'my_asset',
  kind: 'vehicle',
  description: '…',
  tags: ['…'],
  sources: ['https://…spec table…', 'https://…side elevation…'],
  real: {
    length: 6.68, width: 3.0, height: 2.45,
    measures: [ // spec-sheet numbers, checked on LOD0 to ±2%
      { label: 'road wheel diameter', axis: 'z', value: 0.83, parts: ['road_wheel_l_0'], source: '…' },
      { label: 'track centres', axis: 'y', value: 2.45, between: ['track_l', 'track_r'] },
    ],
  },
  budget: { triangles: [40000, 12000, 800] },
  build(ctx) {
    const seg = [24, 12, 6][ctx.lod] ?? 6;
    ctx.part('hull', prism({ plane: 'xz', depth: 3.0, profile: [/* side profile from the drawing */], color: paint }));
    if (ctx.lod === 0) {
      const bolt = lathe({ profile: [[0.02, 0], [0.02, 0.01], [0, 0.015]], segments: 6, color: paint });
      ctx.part('bolts', merge(Array.from({ length: 24 }, (_, i) => place(bolt, { at: [i * 0.2, 1.5, 1.2] }))));
    }
  },
});
```

## Loop
| Step | Command | Exit criterion |
|---|---|---|
| 1 research | WebSearch spec tables + photos per view → `refs/<name>.md` (template: `refs/README.md`) | dossier: every number sourced, one variant chosen |
| 2 masses | `bun run t3d build recipes/x.ts --out out` | QA PASS: proportions ±5%, measures ±2%, every part's surface touches what holds it, no moving part clashes |
| 3 look | `bun run t3d shot recipes/x.ts --out renders` → Read `renders/x.png` | silhouette right in all six views |
| 4 detail | LOD0 dense, LOD1 lean, LOD2 silhouette | budgets met, QA PASS |
| 5 grime | `grime(mesh, { ground: 1, zones })` | darker near ground / exhausts |
| 6 iterate | repeat 3–5 | a stranger names it from the 3/4 view |

## Contact sheet layout
Row 1: 3/4 FRONT · FRONT +X · SIDE -Y. Row 2: TOP · 3/4 REAR · FAR LOD2. Header: name, overall
dimensions, grid step, LOD. Grid = ground plane, step chosen from the asset size.

## QA gates (all must pass at every LOD)
| Gate | Fails when | Fix |
|---|---|---|
| triangle-budget | LOD over `budget` | drop detail at that LOD |
| floating-parts | a part's SURFACE is > 2 cm from anything grounded | the support must exist at that LOD too |
| clashes | anything cuts > 1 cm into a moving part's swept volume | running clearance; `clearOf` only for real interlocks |
| proportions | overall box off `real` by > 5% | rescale from sources |
| measures | a spec dimension off by > 2% | rebuild the part — never edit the spec |
| part-names | not snake_case | rename |
| check | one of the recipe's own `checks` fails | fix the geometry the check names |

## State your physical intent in code
Gates can't know that tracks must clear the hull or that wheels interleave without touching —
the recipe says so, and QA enforces it at every LOD:

```ts
checks: [
  clear('track_*', 'hull_*'),        // no sinking into closed solids (+ optional min gap, m)
  noOverlap('road_wheel_l_*'),       // siblings never interpenetrate
  touches('turret_body', 'hull_top'),// seated within 2 cm
  symmetric('_l', '_r', 'y'),        // left mirrors right
],
```

Debug with `inspect(compile(asset))` in a scratch script: `distance(a, b)`, `penetration(a, b)`,
`bounds(glob)`, `parts(glob)` — find the exact offender, fix the cause, never loosen the selector.

## Conventions
Metres, Z up, +X = front. Named parts are the engine contract. `ctx.rng` only. One asset per file.
Detail is built once in local space and `place`d N times — never hand-copied coordinates.
