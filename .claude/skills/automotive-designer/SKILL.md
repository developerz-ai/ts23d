---
name: automotive-designer
description: An automotive designer's workflow for ts23d — cars, SUVs, pickups, sports cars, buses, motorcycles as original designs. Package and hard points (wheelbase, track, overhangs, H-point), side-view proportions, dash-to-axle, wheel-to-body ratio, stance and wheel-arch gap, greenhouse/DLO, beltline, character lines, surfacing and highlights, clearcoat paint. Use when building or reviewing any road vehicle body, especially passenger cars and sports cars, or the roadster recipe.
---

# Automotive designer

Use with the [author-recipe loop](../author-recipe/SKILL.md), the vehicle playbooks
([passenger-car](../../../docs/playbooks/vehicles/passenger-car.md),
[sports-car](../../../docs/playbooks/vehicles/sports-car.md),
[suv-pickup](../../../docs/playbooks/vehicles/suv-pickup.md)), the
[hard-surface-artist](../hard-surface-artist/SKILL.md) skill for mechanical parts, and
[16-art-as-text](../../../docs/idea/16-art-as-text.md). **Original designs only**: learn package
and proportion from real cars; never a brand's grille shape, lamp signature, badge or name.

## When
Any road vehicle whose body surface is the point: cars, SUVs, pickups, vans, buses, motorcycles.
Reference recipe: [`recipes/roadster_v10`](../../../recipes/roadster_v10/).

## Workflow (studio process → ts23d)
| # | Car-design stage | ts23d | Exit |
|---|---|---|---|
| 1 | Package / hard points: wheelbase, front/rear track, overhangs, tyre size, ground clearance, H-point, roof height | dossier from comparable real cars (spec sheets); `real` + `measures` (`between: ['axle_f','axle_r']` for wheelbase, track) | every hard point sourced as a range from the class |
| 2 | Side-view proportions (the "bones") | inline SVG side elevation: wheel centres, dash, A-pillar, roofline, beltline, rocker | dash-to-axle and wheel-to-body read right at thumbnail |
| 3 | Front and plan views | SVG front (track, tumblehome) and top (plan taper) | `visualHull({ front, side, top })` or `loft` sections agree |
| 4 | Volumes: lower body, greenhouse, wheel arches | `loft` with `ringXY` sections along X, or `hull`/`hullMesh` lines; separate `greenhouse` part on `surface: 'glass'` | `t3d blueprint` all green |
| 5 | Wheels and stance | `_parts/wheel` (`wheel(ctx, 'axle_f', { diameter })`), `axle`; arch radius = tyre radius + gap | wheel-arch gap even, wheels fill arches |
| 6 | Character lines and surfacing | crease as a `sweep` or a tighter `loft` ring; shoulder and rocker as section changes; `weightedNormals` | highlight lines continuous on `raking.png` |
| 7 | Graphics: DLO, lamps, grille (original), shut-lines | lamps as `glow` parts / light sockets; shut-lines as 3–6 mm grooves; doors pivoted at hinges | `t3d gaps` clean |
| 8 | Paint and CMF | `paint: { body }`, `variants` colourways, `finishes` with `clearcoat`; strips `chrome`, `rubber`, `glass`, `plastic` | paint reads as clearcoat, trim separates |
| 9 | Present | `t3d hero --az -35 --el 8–18` (low camera for stance), `t3d shot`, `t3d critique` | scores ≥ 8 |

## Vocabulary → measurable (sources in [skills-matrix](../../../docs/research/skills-matrix.md))
| Word | Meaning here | Check |
|---|---|---|
| Wheelbase / track | axle centre distance / wheel centre distance across | `measures` with `between`, ±2 % |
| Overhang | front axle → bumper, rear axle → bumper; short = sporty | `ruler(c).bounds` vs axle positions |
| Dash-to-axle | front axle → base of windscreen; long = RWD/premium look | measure in a test with `ruler` |
| Wheel-to-body ratio | wheel diameter vs body side height (sill to beltline / roof); classic ≈ 1 : 2 | `measures` on `wheel_*` and body |
| Stance | how the body sits on the wheels: wheels flush to arches, small even arch gap | arch gap ≈ 20–60 mm *typical, verify*; `clear('wheel_*','body*', 0.02)` |
| Greenhouse / DLO | glass area above the beltline / its outline | `greenhouse` part; ratio of glass height to body height |
| Beltline | lower edge of the side glass | `measures` z |
| Tumblehome | inward lean of the side glass from beltline to roof | front view check |
| Character line | main crease along the side catching light | raking light, highlight continuity |
| Highlight continuity | reflections flow without kinks (G1/G2) | zebra renders **planned** |
| Plan taper | body narrows front and rear in top view | `sheet.png` TOP |

## Quality bar
- [ ] Package hard points sourced; wheelbase, track, tyre diameter as `measures`.
- [ ] Wheels big enough and pushed to the corners for the class; even arch gap all round.
- [ ] Side view reads at thumbnail: dash-to-axle, greenhouse proportion, beltline.
- [ ] Surfaces smooth: no faceting or lumps in `hero.png`; highlight lines continuous.
- [ ] Tumblehome and plan taper present; the car is not a box with wheels.
- [ ] Doors, bonnet, boot pivot at real hinges and clear; wheels spin about Y and clear arches.
- [ ] Clearcoat paint, chrome, rubber, glass all distinct; original front graphic.
- [ ] `symmetric('_l', '_r', 'y')`.

## Common mistakes
- Small wheels sunk deep in the arches: the "toy" stance.
- Flat sides with no tumblehome or plan taper.
- Character line drawn as a texture instead of a surface change.
- Uneven arch gaps; tyres intersecting arches on steer.
- Greenhouse too tall (bus-like) or too thin for the class.
- Reproducing a real brand's grille or lamp signature.

## Run order
```sh
bun run t3d build recipes/<name>/<name>.ts --out out        # QA per LOD, exit 1 on a finding
bun run t3d shot recipes/<name>/<name>.ts --out renders     # READ sheet.png
bun run t3d hero recipes/<name>/<name>.ts --out renders     # READ hero.png
bun run t3d blueprint recipes/<name>/<name>.ts --out renders  # READ blueprint.png
bun run t3d hero recipes/<name>/<name>.ts --out renders --el 8   # low camera: stance
bun run t3d critique recipes/<name>/<name>.ts --out tmp/critique  # READ every PNG, fill critique.json
bun run shots <name>                      # refresh committed out/
```

## Pairs with
- [hard-surface-artist](../hard-surface-artist/SKILL.md): chassis, engine, mechanical detail.
- [rigger-animator](../rigger-animator/SKILL.md): doors, wheels, steering.
- [material-artist](../material-artist/SKILL.md): clearcoat, chrome, tyre rubber.
- [concept-artist](../concept-artist/SKILL.md): original front graphic and silhouette.
- [presentation-artist](../presentation-artist/SKILL.md): stance shots.

## Tool status
Shipped: `loft`/`ringXY`, `sweep`, `hull`/`hullLines`, `visualHull`, `_parts/wheel`, `axle`,
`real.measures`, `checks`, `paint`/`variants`/`finishes` (clearcoat), `glow`, light sockets.
Planned / gaps: zebra and reflection-line review, curvature combs, G2-continuous surface patches
(no NURBS/subdivision surfaces today), steering motion with arch clearance, mirrors and light
cluster parts ([roadmap](../../../docs/plans/roadmap.md)).
Neutral positioning: the free code-based option; not a Class-A surfacing tool.
