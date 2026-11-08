---
name: author-recipe
description: The closed agent loop for writing a ts23d asset recipe in TypeScript — research real dimensions, block out masses, compile until QA PASS, render a six-view contact sheet, READ it, add LOD-gated detail, grime, iterate. Use whenever creating or improving anything in recipes/.
---

# Authoring a recipe

The human names a thing; you research it (specs + real photos) into `recipes/<name>/README.md`; then you build
it here; the gates prove the model matches the research.

A recipe is a TypeScript module exporting one `defineAsset(...)`. It is code: loops, helpers,
`ctx.use` composition, `ctx.lod` gating. Never JSON.

## Skeleton

```ts
// <Name> — <one line>. Real: L × W × H m. Sources below.
import { beam, box, defineAsset, grime, hex, lathe, merge, place, prism } from '@developerz.ai/ts23d';

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
| 1 research | WebSearch + WebFetch: the spec table (manufacturer sheet, museum page, roster, drawing) and real photos per view (side elevation, front, 3/4, top, close-ups of signature details) → `recipes/<name>/README.md` (template: `recipes/README.md`). Link photos, never commit them (licences); Wikimedia Commons is the best first stop. Invented assets (sci-fi, fantasy) get a design dossier instead: scale references from real things, shape language, palette | dossier: every number sourced, one variant chosen, photos linked per view |
| 2 masses | `bun run t3d build recipes/x/x.ts --out out` | QA PASS: proportions ±5%, measures ±2%, every part's surface touches what holds it, no moving part clashes, no slit you can see light through (`gaps`; on a finding run `bun run t3d gaps recipes/x/x.ts --out renders` and Read `gaps/overlay.png` + `zoom_*.png`) |
| 3 look | `bun run t3d shot recipes/x/x.ts --out renders` → Read the sheet PNG; `bun run t3d hero recipes/x/x.ts --out renders` → Read the beauty render; `bun run t3d blueprint recipes/x/x.ts --out renders` → Read `blueprint.png` (every measure green, joints green, the 1.8 m figure says the scale is right). Characters and multi-file assets: declare `ctx.joint` at every connection (wrist, neck, grip) so QA `joints` proves the parts fit | silhouette right in all six views; reads as the real thing in the 3/4 beauty shot; blueprint all green |
| 4 detail | LOD0 dense, LOD1 lean, LOD2 silhouette. Hard surface: `box({ bevel: ctx.pick([0.02, 0.01, 0]) })` + `weightedNormals` (the mid-poly trick); walls: `tiled` / `mass` / `opening` (true-scale masonry, recessed windows); trusses: `lattice`; organic: `sculpt` | budgets met, QA PASS |
| 5 grime | `grime(mesh, { ground: 1, zones })`; `bakeAo` for crevices | darker near ground / exhausts / creases |
| 6 review | `bun run t3d review recipes/x/x.ts --out review` → Read `review/*.png`, follow `review/review.md`, clear `review.json` warnings (LOD popping, exposure, tiny-in-frame) | no warnings you can't explain |
| 7 iterate | repeat 3–6. Be harsh: compare the hero side by side with the reference photos; flat single-colour paint, blobby forms or toy proportions are failures even at QA PASS. Use the material library (wood, iron, brass, rubber…), not plain colour | a stranger names it from the 3/4 view and it could sit in a shipped game |
| 8 publish | `bun run shots <name>` → commit `recipes/<name>/out/` | the recipes gate checks the committed outputs match the recipe |

## Write as much code as the asset needs
**Search `recipes/_parts/README.md` (the parts kit: bolts, hinges, wheels, pipes, doors, windows, ladders, lamps…) before writing geometry**; reuse a part with `part(ctx, name, overrides)` or `part.mesh(overrides, ctx)`, and add a missing reusable piece there with `definePart` ([14-parts](../../../docs/idea/14-parts.md)).
Code is cheap for an agent; quality is not. A kind preset (`head(ctx, { race: 'orc' })`) is a starting
point, not a finished hero asset. Sculpt like an artist, in stages: block-out from separate masses
(cranium, jaw, neck; hull, turret, wheels) → define planes and silhouette from front, side and 3/4 →
features → secondary forms → tertiary detail and wear. 500–1,500 lines for a hero asset is normal.

## Contact sheet layout
Row 1: 3/4 FRONT · FRONT +X · SIDE -Y. Row 2: TOP · 3/4 REAR · FAR LOD2. Header: name, overall
dimensions, grid step, LOD. Grid = ground plane, step chosen from the asset size.

## QA gates (all must pass at every LOD)
| Gate | Fails when | Fix |
|---|---|---|
| triangle-budget | LOD over `budget` | drop detail at that LOD |
| floating-parts | a part's SURFACE is > 2 cm from anything grounded | the support must exist at that LOD too |
| gaps (LOD0) | a 6 mm–5 cm slit between two parts drops ≥ 10 cm behind both rims (door short of its header, plate short of its rail) | close it; a real opening (vent, seam, track clearance) goes in `gaps: [{ parts, why }]` |
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
Metres, Z up, +X = front. Named parts are the engine contract. `ctx.rng` only. One asset per
folder: `recipes/<name>/<name>.ts` + `README.md` + committed `out/`.
Detail is built once in local space and `place`d N times — never hand-copied coordinates.

## Critique: score ≥ 8 on every criterion before done

QA PASS means valid, not good. Before calling an asset done:

1. `bun run shots <name>` so `out/<asset>/hero.png` and `sheet.png` are current.
2. `bun run t3d critique recipes/<name>/<name>.ts --out tmp/critique` — no `critique-drift` warning.
3. READ every PNG in `tmp/critique/<asset>/critique/`, open the links in `refs.md`, follow `rubric.md`.
4. Write `recipes/<name>/out/<asset>/critique.json` from `critique.template.json`: every criterion
   `{ score, reason, fixes[] }`, `overall`, `reviewer: "agent"`, the `renders` hashes as given. Be
   harsh: 8 = ships in a commercial game with no human polish pass.
5. Any score < 8: apply its fixes, then go back to step 1. A changed render makes the critique
   stale; the recipes gate reports it (warn mode today, enforce later).

**Before researching a real thing, open its class playbook in [`docs/playbooks/`](../../../docs/playbooks/README.md)** (forklift, car, house, pallet, tree…): what to look up, the part tree, motion limits, signature details, materials, LOD policy, QA measures and common mistakes.

**Load the discipline skill for the job** ([skills matrix](../../../docs/research/skills-matrix.md)): `character-artist`, `creature-artist`, `hard-surface-artist`, `environment-artist`, `prop-artist`, `material-artist`, `technical-artist`, `presentation-artist`, `architect`, `product-designer`, `automotive-designer`, `concept-artist`, `rigger-animator`, `art-director`.
