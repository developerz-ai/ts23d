# House playbook

Detached, semi-detached and terraced houses, 1–3 storeys, pitched roofs; vernacular and period
styles (Victorian terrace, timber-frame, American four-square, Scandinavian log, Mediterranean
render). **Scale from the door and the storey**: an external door is ~2.0–2.1 m tall and 0.8–0.9 m
wide in every country; floor-to-floor height is 2.6–3.2 m (older and grander houses higher).

## Research
National building regulations for human-scale minimums (stair rise/going, guard heights, door
widths), a period style guide (window proportions, roof pitch, materials), and street-level photos
of one real house per view (front elevation square-on, side, rear, roof from above via aerial
imagery). Brick and block sizes come from the national standard.

| Dimension | Typical | Notes / source |
|---|---|---|
| floor-to-floor | 2.6–2.8 m (modern), 3.0–3.6 (Victorian ground floor) | |
| internal ceiling | 2.4–2.5 m (min 2.1–2.3 by code) | |
| external door leaf | 0.81–0.91 × 1.98–2.1 m | UK 838 × 1981, US 36 × 80 in (0.91 × 2.03) |
| window sill above floor | 0.8–1.0 m; head ≈ door head height | |
| roof pitch | 30–45° (tile/slate), 15–25° (Mediterranean), 45–60° (snow, thatch) | |
| eaves overhang | 0.2–0.6 m | |
| stair rise / going | 150–220 mm / 220–300 mm | UK Approved Doc K max rise 220; IRC max 7¾ in (197 mm) |
| guard (balustrade) height | 0.9 m stairs, 1.1 m balconies | Approved Doc K / IRC 1015 |
| brick (UK / EU-DF / US modular) | 215×102.5×65 / 240×115×52 / 194×92×57 mm + 10 mm joints | BS EN 771-1 / DIN 105 / ASTM C216 |
| wall thickness | 0.25–0.35 m cavity masonry, 0.15–0.2 timber frame | |
| chimney stack | 0.45–0.9 m square, top ≥ 0.6–1 m above ridge nearby | |
| terrace frontage | 4.5–6 m | |

## Part tree
```
mass_ground, mass_upper (static walls via `mass` for true-scale masonry)
├── roof (roof / roofMesh: gable, hip, mansard…) · chimney_* · gutter_* · downpipe_*
├── win_<side>_<floor>_<i> (opening kit: frame, sash, glass, sill, lintel)
├── door_front (panel_door: frame + leaf; leaf sways Z about its hinge edge)
├── porch / canopy, steps_*, path, fence (see fences playbook), garage_door (slide/sway)
└── sockets: interact (door handle), spawn (front step), light (porch lamp)
```
Use `facade` with a split-grammar line per floor for regular elevations; place one-off openings
with `opening` and `place`.

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| front door leaf | sway `oneWay` | Z at hinge edge | 90–100° inward |
| casement sash | sway `oneWay` | Z at hinge | 90° outward |
| sash window (UK/US) | slide `oneWay` | +Z | half the window height |
| garage up-and-over | sway `oneWay` | Y at top pivot | 90° |
| smoke from chimney | emitter smoke | +Z | |

## Signature details
1. Openings recessed 0.05–0.15 m into the wall with sills and lintels / arches; never flush stickers.
2. Window glazing bars matching the period (6-over-6 Georgian, 1-over-1 Victorian, casements).
3. Roof: ridge tiles, verges, eaves with fascia and gutter, downpipes to the ground.
4. Chimney stacks with pots, flashing where they meet the roof.
5. Plinth / damp-proof course line, airbricks, step to the front door.
6. Bond pattern correct (stretcher for cavity walls, Flemish / English for solid pre-1930).
7. Variation between neighbours in a terrace: door colour, curtains, satellite dish, plant pots.
8. Corner quoins, string courses, bay windows where the style has them.

## Materials
`brick` (classic strip, vertex-tinted) or a measured bond via `mass`, `stone` / `concrete` render,
`slate` roofs or `plain` clay tile tinted, `wood_painted` doors, frames and fascia,
`glass` panes, `steel_galvanised` / `plastic` gutters, `iron_cast` railings, `pine` / `oak` for
timber framing. Grime: darker below sills (rain streaks), green near the ground and under gutters,
soot on chimney tops.

## LOD policy
- LOD0: masonry courses as geometry where the budget allows, window reveals with sashes and bars,
  door panels, gutters and downpipes, roof tiles as `tiled` strip with ridge geometry. 10–40k.
- LOD1: openings as inset panels with glass, roof slab with ridge, no gutters. 2–6k.
- LOD2: mass + roof (≤ 40 tris) + darkened window cells on the texture. 150–400.

## QA
```ts
real: { length: 8.0, width: 10.0, height: 8.6, measures: [
  { label: 'front door height', axis: 'z', value: 2.03, parts: ['door_front_leaf'] },
  { label: 'storey height', axis: 'z', value: 2.75, parts: ['mass_ground'] },
]},
checks: [touches('roof', 'mass_upper'), touches('chimney_*', 'roof'), touches('downpipe_*', 'mass_*')],
gaps: [{ parts: ['door_front_leaf', 'door_front_frame'], why: '3 mm door clearance' }],
```

## Common mistakes
- Doors 2.5 m tall or windows at waist height — the eye reads the storey off the door.
- Flat facades with windows as texture; no reveals, sills or lintels.
- Roof without overhang, fascia or gutter; chimney floating above the roof.
- Masonry stretched by `box` UVs instead of courses starting at the ground (`mass`).
- Every house in a street identical: vary with `ctx.rng` and `ctx.use({ seed })`.

## Reuse
Kind builders `mass`, `facade`, `roof` / `roofMesh`, `opening`, `setbacks`; parts `panel_door`,
`casement_window`, `door_handle`, `hinge`, `lamp`, `pipe` (downpipes), `railing`. Reference recipe:
[`station_halt`](../../../recipes/station_halt/README.md). Street of varied houses: see
[02-dsl composition](../../idea/02-dsl.md#composition-ctxuse).

## Sources
- UK Approved Document K (stairs, guarding): https://www.gov.uk/government/publications/protection-from-falling-collision-and-impact-approved-document-k
- US IRC (International Residential Code) R311 stairs: https://codes.iccsafe.org/
- Brick sizes: https://en.wikipedia.org/wiki/Brick#Dimensions · bonds: https://en.wikipedia.org/wiki/Brickwork
- Roof pitch and types: https://en.wikipedia.org/wiki/Roof_pitch
