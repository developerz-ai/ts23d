---
name: product-designer
description: An industrial / product designer's workflow for ts23d — consumer products, appliances, electronics, tools, furniture, packaging as 3D assets. User scenarios, ergonomics and anthropometric percentiles (5th–95th), grips and reach, design for manufacture (draft, uniform wall thickness, ribs, radii), CMF (colour, material, finish) as paint slots, variants and finishes, believable part lines. Use when building or reviewing a product, appliance, device, handheld tool, bottle, enclosure or furniture recipe, or defining a CMF / colourway set.
---

# Industrial / product designer

Use with the [author-recipe loop](../author-recipe/SKILL.md), the props playbooks
([electronics](../../../docs/playbooks/props/electronics.md),
[kitchen-appliances](../../../docs/playbooks/props/kitchen-appliances.md),
[tools](../../../docs/playbooks/props/tools.md), [furniture](../../../docs/playbooks/props/furniture.md))
and [16-art-as-text](../../../docs/idea/16-art-as-text.md). Original designs only: learn
proportions and engineering from real products; never copy a logo, badge or trade dress.

## When
Anything manufactured and handled: devices, appliances, tools, bottles, enclosures, chairs,
lamps, packaging; and any colourway/CMF task across a product family.

## Workflow (ID process → ts23d)
| # | Designer stage | ts23d | Exit |
|---|---|---|---|
| 1 | Research: users, scenarios, competitors' dimensions, standards | dossier: who holds it, how, where; key dimensions with sources | user scenario in one paragraph |
| 2 | Ergonomic envelope: hand, reach, sight lines | `measures` for grip diameter, handle length, seat/worktop height; `ctx.joint('grip', { kind: 'grip' })` | grips 30–50 mm Ø for power grip *typical, verify* |
| 3 | Sketch / form exploration | inline SVG side + front; `extrudeSvg`, `latheSvg`, `visualHull`; options as `defineFamily` variants | 3 forms compared on one sheet |
| 4 | Block model (foam model equivalent) | `box({ bevel })`, `lathe`, `loft` | proportions approved on `t3d blueprint` |
| 5 | Manufacturing logic (DFM) | split into real moulded/stamped parts: `shell_top`, `shell_bottom`, `button_*`; part lines as 0.3–1 mm grooves *typical* | `assertMinThickness`, `touches` between shells |
| 6 | Surface transitions | radii on every edge (`bevel`), `weightedNormals`; continuous highlights (raking light) | no faceting in `hero.png` |
| 7 | CMF | `paint` slots (`{ body: '#…', accent: '#…' }`), `variants` colourways (KHR_materials_variants), `finishes` (clearcoat, anisotropy for brushed metal, sheen for fabric), strips `plastic`, `aluminium`, `rubber`, `glass` | colourways switch in the GLB |
| 8 | Details: fasteners, vents, labels, buttons | `_parts` (`hex_bolt`, `washer`), `text` for markings, LOD0 only | detail matches the process (moulded vs machined) |
| 9 | Physical plausibility | `physics` + `real.mass`; `assertCentreOfMassInside`, `assertUprightOnGround` | stands, weight plausible |
| 10 | Present | `t3d hero` (product 3/4), `--variant <name>` renders per colourway, `t3d critique` | scores ≥ 8 |

## Vocabulary → measurable (sources in [skills-matrix](../../../docs/research/skills-matrix.md))
| Word | Meaning here | Check |
|---|---|---|
| Percentile design | clearances for the 95th-percentile male, reach for the 5th-percentile female | `measures`, `assertBetween` |
| Power / precision grip | handle wrapped by the fist / pinched by fingers | `ctx.joint({ kind: 'grip' })` → `joints` |
| Draft | taper on moulded walls to release from the mould; ≈ 1° per inch of depth (Protolabs) | **no tool**; model it in profiles |
| Wall thickness | uniform; ABS ≈ 1.1–3.6 mm, PP ≈ 0.6–3.8 mm (Protolabs) | `assertMinThickness(asset, metres)`, `wallThickness` |
| Rib | stiffener 50–60 % of the wall it joins | by hand |
| Part line | the seam between moulded parts; consistent width | `gaps` declared `why: 'part line'` if see-through |
| CMF | colour + material + finish per surface, as a set | `paint`, `variants`, `finishes`, strips |
| Colourway | a named CMF variant of one product | `variants` + `t3d hero --variant` |
| Surface continuity | highlights flow across edges without kinks (G1/G2) | raking light; zebra **planned** |

## Quality bar
- [ ] Every handled feature sized for hands; grip joints fit.
- [ ] Parts split where a factory would split them; seams consistent and touching.
- [ ] Walls not thinner than the process allows; radii on all moulded edges.
- [ ] CMF reads: matte vs gloss vs metal vs rubber separate by roughness and value.
- [ ] Colourways as `variants`, not separate assets.
- [ ] Stands upright with plausible mass.

## Common mistakes
- Sharp 90° moulded edges (no radius) or knife-thin shells.
- Seams that wander or stop; buttons floating above the shell.
- One glossy plastic for everything.
- Ergonomics by eye: handles too thin, buttons too small for a thumb.
- Copying a famous product's silhouette or badge.

## Test it
```ts
import { assertMinThickness, assertUprightOnGround } from '@developerz.ai/ts23d/testing';
it('shell is mouldable: no wall under 1.2 mm', () => assertMinThickness(kettle, 0.0012));
it('stands on its base', () => assertUprightOnGround(kettle));
```

## Run order
```sh
bun run t3d build recipes/<name>/<name>.ts --out out        # QA per LOD, exit 1 on a finding
bun run t3d shot recipes/<name>/<name>.ts --out renders     # READ sheet.png
bun run t3d hero recipes/<name>/<name>.ts --out renders     # READ hero.png
bun run t3d blueprint recipes/<name>/<name>.ts --out renders  # READ blueprint.png
bun run t3d hero recipes/<name>/<name>.ts --out renders --variant <colourway>  # one render per CMF
bun run t3d critique recipes/<name>/<name>.ts --out tmp/critique  # READ every PNG, fill critique.json
bun run shots <name>                      # refresh committed out/
```

## Pairs with
- [prop-artist](../prop-artist/SKILL.md): game-prop budgets and wear.
- [material-artist](../material-artist/SKILL.md): finishes and CMF values.
- [hard-surface-artist](../hard-surface-artist/SKILL.md): bevels and weighted normals.
- [rigger-animator](../rigger-animator/SKILL.md): lids, buttons, hinges.
- [presentation-artist](../presentation-artist/SKILL.md): product shots.

## Tool status
Shipped: all named above. Planned / gaps: zebra and curvature-comb review, section cuts,
draft-angle analysis, adjustable ergonomic manikin (only a fixed 1.8 m blueprint figure today),
STL/3MF export with wall-thickness checks ([roadmap "Reach"](../../../docs/plans/roadmap.md)).
Neutral positioning: the free code-based option; not CAD, and makes no claim to replace it.
