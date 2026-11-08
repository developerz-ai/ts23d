---
name: prop-artist
description: A game prop artist's workflow for ts23d — furniture, crates, barrels, pallets, tools, kitchen and office objects, street furniture, weapons on a rack, instruments. Real-object research, one trusted dimension, material breakup (3–6 materials), story through wear, tight per-LOD budgets, reusable parts. Use when building or reviewing any small-to-medium static or lightly animated object recipe.
---

# Prop artist

Use with the [author-recipe loop](../author-recipe/SKILL.md) and the matching playbook in
[`docs/playbooks/props/`](../../../docs/playbooks/README.md) or
[`buildings/street-furniture`](../../../docs/playbooks/buildings/street-furniture.md).
Definitions: [16-art-as-text](../../../docs/idea/16-art-as-text.md). Original designs in the class:
learn proportions from real products, never copy a brand's mark or trade dress.

## When
Any object a player could pick up, sit on, open or walk past: chairs, tables, crates, drums,
pallets, containers, lamps, signs, tools, appliances, instruments, historic weapons.

## Workflow
| # | Prop stage | ts23d | Exit |
|---|---|---|---|
| 1 | Reference: product sheet or standard + photos (front, side, 3/4, details, worn examples) | dossier; playbook "Research" table; standards (EUR pallet, ISO 668 container) | one variant, numbers sourced |
| 2 | Scale from one trusted number (seat height 0.45 m, pallet 1.2 × 0.8 m, door handle 1.0 m) | `real` + `measures` on that number | `measures` ±2 % |
| 3 | Block-out | `box`, `lathe` (barrels, bottles), `prism`, `extrudeSvg` / `latheSvg` from a profile drawing | silhouette right in `sheet.png` |
| 4 | Construction logic: how it is made and held together | separate parts per piece (legs, rails, staves, hoops); `touches`, `noOverlap` | QA PASS, no floating parts |
| 5 | Reuse | `recipes/_parts`: `hinge`, `door_handle`, `hex_bolt`, `washer`, `pipe`, `lamp`, `wheel`… | nothing rebuilt that the kit has |
| 6 | Detail, LOD-gated | bevels `ctx.pick([...])`, screws/nails placed once N times, LOD0 only | budget met |
| 7 | Materials: break up flat colour | library strips (`oak`, `pine`, `wood_painted`, `steel_painted`, `brass`, `rubber`, `plastic`, `leather`, `canvas`), `paint` slots, `finishes` | 3–6 materials read in `hero.png` |
| 8 | Story and wear | `grime`, `bakeAo`, `weathered({ wear, age })` strip variants | wear where hands, feet and water go |
| 9 | Interaction hooks | `ctx.socket('handle', { kind: 'interact' })`, doors/lids with `motion` and pivot at the hinge | `clashes` PASS |
| 10 | Present | `t3d shot / hero / critique` | scores ≥ 8 |

## Vocabulary → measurable
| Word | Meaning here | Check |
|---|---|---|
| Trusted dimension | the one size the world standardises; everything else measured against it | `real.measures` |
| Material breakup | distinct albedo/roughness/metal regions; real objects are 3–6 materials | count strips/slots; critique `materials` |
| Wear logic | chips on convex edges, polish where touched, dirt in crevices and near the ground | `grime` zones; edge wear from curvature **planned** |
| Grounded | rests on its feet; CoM over the footprint | `floating-parts`, `assertUprightOnGround` |
| Readability | the 3/4 view names the object without colour | `assertLodSilhouette`, critique `silhouette` |
| Budget | props are cheap: hundreds to a few thousand triangles at LOD0, tens to a few hundred at LOD2 *typical* | `budget.triangles`, `assertBudget` |
| Texel density | matches the environment it lives in | `assertTexelDensity` |

## Quality bar
- [ ] Trusted dimension sourced and declared; ergonomics right (seat, handle, worktop heights).
- [ ] Built like the real thing: legs carry the top, hoops bind the staves, screws go into wood.
- [ ] 3–6 materials, each from the library; no single flat vertex colour.
- [ ] Bevels catch light on every visible hard edge at LOD0.
- [ ] Wear tells one coherent story (new, used, abandoned).
- [ ] Opening parts pivot at the real hinge and clear.
- [ ] LOD2 a few hundred triangles at most, outline intact.

## Common mistakes
- Toy scale from guessing; no trusted number.
- One box with painted-on detail; no construction.
- Perfect, factory-new surfaces on a prop meant to be lived with.
- Over-detail on a prop that will be seen at 10 m (budget spent where nobody looks).
- Copying a famous product's logo or exact form.

## Test it
```ts
import { assertBudget, assertUprightOnGround } from '@developerz.ai/ts23d/testing';
it('stands on its feet', () => assertUprightOnGround(stool));
```

## Run order
```sh
bun run t3d build recipes/<name>/<name>.ts --out out        # QA per LOD, exit 1 on a finding
bun run t3d shot recipes/<name>/<name>.ts --out renders     # READ sheet.png
bun run t3d hero recipes/<name>/<name>.ts --out renders     # READ hero.png
bun run t3d blueprint recipes/<name>/<name>.ts --out renders  # READ blueprint.png
bun run t3d review recipes/<name>/<name>.ts --out review   # close-ups, LOD strip
bun run t3d critique recipes/<name>/<name>.ts --out tmp/critique  # READ every PNG, fill critique.json
bun run shots <name>                      # refresh committed out/
```

## Pairs with
- [product-designer](../product-designer/SKILL.md): manufactured, handled objects.
- [hard-surface-artist](../hard-surface-artist/SKILL.md): mechanical props.
- [material-artist](../material-artist/SKILL.md): wood, metal, fabric breakup.
- [environment-artist](../environment-artist/SKILL.md): where the prop lives.
- [technical-artist](../technical-artist/SKILL.md): tight budgets.

## Tool status
Shipped: all named above. Planned: seats, mirrors, light clusters, stairs, gutters, number plates
in `_parts`; `weather()`, edge wear from curvature, `imperfect()` (sag, dents, warped boards).
Neutral positioning: the free code-based option, no claims against other tools.
