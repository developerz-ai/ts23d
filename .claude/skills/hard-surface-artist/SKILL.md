---
name: hard-surface-artist
description: A hard-surface and vehicle artist's workflow for ts23d — tanks, locomotives, aircraft, machines, weapons, sci-fi hardware. Blueprint-driven block-out, primary/secondary/tertiary shapes, controlled bevels + weighted normals (mid-poly), panel lines and shut-lines, mechanical logic (every bolt holds something), moving parts that clear. Use when building or reviewing any mechanical, vehicle, armour, machine or weapon recipe.
---

# Hard-surface / vehicle artist

Use with the [author-recipe loop](../author-recipe/SKILL.md) and the class playbook in
[`docs/playbooks/vehicles/`](../../../docs/playbooks/README.md) (afv, rail, aircraft, truck…).
Definitions: [16-art-as-text](../../../docs/idea/16-art-as-text.md). Cars specifically: also load
[automotive-designer](../automotive-designer/SKILL.md). Historic public-domain subjects are fine;
never a brand's logo, badge or trade dress.

## When
Vehicles, machines, mechanisms, weapons, armour, sci-fi hardware, industrial props.

## Workflow (studio pipeline → ts23d)
| # | Stage | ts23d | Exit |
|---|---|---|---|
| 1 | Blueprints + photo set (side, front, top, 3/4, details) for ONE variant | dossier; `sources`; `real` + 4–8 `measures` (wheel diameter, gauge, wheelbase, turret width) | every number sourced |
| 2 | Block-out to scale, primary shapes only | `prism` from the side profile (`plane: 'xz'`), `box`, `lathe`/`cylinder`, `extrudeSvg` from a drawing; `ctx.group` pivots at real hinges | `t3d build` QA PASS: proportions ±5 %, measures ±2 % |
| 3 | Secondary shapes: hatches, fenders, panels, housings | separate parts, `touches(...)`, `symmetric('_l','_r','y')` | `t3d blueprint` all green |
| 4 | Bevel pass (mid-poly) | `box({ bevel: ctx.pick([0.02, 0.01, 0]) })` + `weightedNormals` | no black shading gradients in `hero.png` |
| 5 | Tertiary: bolts, rivets, hinges, welds, vents | `recipes/_parts` (`hex_bolt`, `rivet_row`, `hinge`, `flange`, `pipe`, `valve_wheel`); build once, `place` N, `merge`; LOD0 only | `raking.png` shows relief |
| 6 | Mechanics | `motion: spin/slide/sway`, `clearOf` for real interlocks, `trackRun`, `axle`, `whyteAxles`, `propeller` | `clashes` PASS through full motion |
| 7 | Seams and openings | shut-lines as 3–6 mm grooves; real openings in `gaps: [{ parts, why }]` | `t3d gaps` clean |
| 8 | Materials + paint + wear | library strips (`steel_painted`, `iron_cast`, `rubber`, `glass`), `paint` slots, `variants` liveries, `grime`, `bakeAo` | ≥ 3 distinct materials read |
| 9 | Present | `t3d shot / hero / review / critique` | scores ≥ 8 |

## Vocabulary → measurable
| Word | Meaning here | Check |
|---|---|---|
| Primary / secondary / tertiary | hull and turret / hatches and fenders / bolts and welds; each ~⅓–⅒ the size of the last *typical* | build order; LOD policy: tertiary LOD0 only |
| Controlled bevel | bevel on every silhouette edge and every hard edge the camera sees; width 0.5–2 % of the part *typical, verify* | `bevel` option; `raking.png` highlight lines |
| Weighted normals | normals follow the large faces so bevels read without shading smears; needs bevels [Polycount] | `weightedNormals` |
| Shut-line | panel gap 3–6 mm, closed behind (not a slit you can see through) | `gaps` gate |
| Mechanical logic | every bolt, hinge and bracket holds or moves something | review: name the job of each |
| Clearance | moving part's swept volume free by ≥ 1 cm | `clashes`, `assertMotionClear`, `clear(a, b, 0.02)` |
| Real scale | one trusted number (wheel, gauge, door) drives everything | `real.measures` ±2 % |
| Rest area | large flat plates left plain between detail clusters | **planned** metric; judge in critique |

## Quality bar
- [ ] Side silhouette matches the elevation drawing (overlay by eye; `photoMatch` **planned**).
- [ ] Every measure green on `blueprint.png`; human figure says the scale is right.
- [ ] All hard edges bevelled at LOD0; LOD2 drops bevels, keeps outline.
- [ ] Detail clustered where the real thing has it; big plates rest.
- [ ] Hinged parts pivot at the hinge line; wheels spin about local Y.
- [ ] No floating parts at any LOD (supports exist at that LOD too).
- [ ] Paint separates from bare metal, rubber, glass by value and roughness; wear on edges, grime low.
- [ ] Budgets met; detail built once and placed, never hand-copied coordinates.

## Common mistakes
- Greebles instead of clean forms: "controlled bevels and lump-free surfaces beat added greebles".
- Bevel width constant across a 6 m hull and a 5 cm bracket.
- Toy scale: a door handle at 0.6 m, tyres too small.
- Panels that overlap (z-fighting) or stop short (slits); fix with `touches` and `gaps`.
- Spinning a wheel about its world centre instead of its axle pivot.
- One flat paint colour at QA PASS.

## Test it
```ts
import { assertMeasure, assertMotionClear, assertQaPass } from '@developerz.ai/ts23d/testing';
it('passes QA at every LOD', () => assertQaPass(t34));
it('turret traverses clear of the hull', () => assertMotionClear(t34));
```
Debug with `inspect(compile(asset))`: `distance`, `penetration`, `bounds`.

## Run order
```sh
bun run t3d build recipes/<name>/<name>.ts --out out        # QA per LOD, exit 1 on a finding
bun run t3d shot recipes/<name>/<name>.ts --out renders     # READ sheet.png
bun run t3d hero recipes/<name>/<name>.ts --out renders     # READ hero.png
bun run t3d blueprint recipes/<name>/<name>.ts --out renders  # READ blueprint.png
bun run t3d gaps recipes/<name>/<name>.ts --out renders     # on a gaps finding: READ overlay.png
bun run t3d critique recipes/<name>/<name>.ts --out tmp/critique  # READ every PNG, fill critique.json
bun run shots <name>                      # refresh committed out/
```

## Pairs with
- [automotive-designer](../automotive-designer/SKILL.md): car bodies and surfacing.
- [rigger-animator](../rigger-animator/SKILL.md): pivots, motion, clearance.
- [material-artist](../material-artist/SKILL.md): paint, metal, rubber, glass.
- [technical-artist](../technical-artist/SKILL.md): budgets and LOD policy.
- [prop-artist](../prop-artist/SKILL.md): small mechanical props.

## Tool status
Shipped: everything named above. Planned: `motion: 'orbit'` (side rods, cranks),
`ornament` (raised SVG decals), edge wear from curvature, `photoMatch` overlay, zebra review.
Neutral positioning: the free code-based option, no claims against other tools.
