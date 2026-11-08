# Street furniture playbook

Lamp post, bench, litter bin, road sign, traffic light, fire hydrant, bollard, post box style
boxes, bus shelter, bike rack. Small, repeated thousands of times in a city: triangle budgets and
instancing matter more than anywhere else. Generic or historic designs; no city or company
branding, invented sign text where it is not a regulatory symbol. **Scale from the human**:
sit height, hand height and eye height decide every one of these.

## Research
National traffic sign manuals (sign sizes, mounting heights, colours — UK TSRGD / Traffic Signs
Manual, US MUTCD, Vienna Convention signs in Europe), lighting columns (EN 40), hydrant
standards (US AWWA C502 dry barrel, EU EN 14384 pillar hydrants), product catalogues for
benches/bins. Photos per object: elevation, 3/4, base fixing, top detail.

| Object | Key dimensions (typical) | Source / note |
|---|---|---|
| street light column | 4–6 m residential, 8–12 m main roads; arm outreach 0.5–2 m | EN 40 |
| heritage lamp post | 3.5–4.5 m, lantern 0.6–0.9 m | |
| bench | seat 0.42–0.48 m high, 0.4–0.5 m deep, back to 0.8–0.9 m, length 1.5–2.0 | |
| litter bin | 0.8–1.1 m tall, Ø 0.4–0.6, 50–120 l | |
| sign plate (circular, UK) | 600 / 750 / 900 mm Ø | Traffic Signs Manual ch. 3 |
| sign mounting | lower edge ≥ 2.1 m over footway (2.3 m over cycle) | TSM / local rules |
| US stop sign | 30 in (0.76 m) octagon, lower edge ≥ 7 ft (2.1 m) urban | MUTCD 2A |
| traffic signal head | 3 aspects, lenses 200 or 300 mm; bottom ≥ 15 ft (4.6 m) over the roadway | MUTCD 4D |
| pedestrian signal / post-mounted head | 2.1–3 m to bottom of head | |
| fire hydrant (US dry barrel) | 0.75–0.9 m tall, 2 × 2½ in + 1 × 4½ in outlets, pentagon nut | AWWA C502 |
| bollard | 0.9–1.0 m tall, Ø 0.1–0.25 m, spacing ≤ 1.5 m (pedestrian 1.2 m clear) | |
| bike rack (Sheffield stand) | 0.75–0.8 m tall, 0.7–1.0 m long | |
| bus shelter | 2.4–2.6 m tall, 1.3–1.6 deep, 3–6 long | |

## Part tree
Name each object as its own small asset; scenes `ctx.use` them.
```
lamp_post: base, column (tapered `lathe`), arm, lantern → lamp_glass (glow), socket light
bench: frame_l/_r (cast ends), slat_<i>, armrest_* · socket seat ×2–3
bin: body, liner, lid (sway Y `oneWay` 60°), post / base plate
sign: post, plate (planar + border), clips · traffic_light: pole, arm, head_<i> → lens_red/amber/green (glow)
hydrant: barrel, bonnet, outlet_<i>, cap_<i>, operating_nut · bollard: body, cap, reflective band
```

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| bin lid | sway `oneWay` | Y at hinge | 60–90° |
| hanging sign / lantern | sway | X | ±3°, wind |
| retractable bollard | slide `oneWay` | −Z | full height |
| barrier arm | sway `oneWay` | Y | 90° |
| signal aspects | glow toggled by engine; bake none | | |

## Signature details
1. Bases: bolted flange plates or a root buried with a collar — never floating, never a bare cut.
2. Columns taper; heritage posts have fluted shafts, ladder bars, cast collars.
3. Bench slats with gaps (8–15 mm), end frames carrying them; armrests to stop sleeping on long benches.
4. Signs: retro-reflective face with a border, back of the plate grey with clips and bands.
5. Traffic lights: visors (hoods) over each lens, backboard with white border on many networks.
6. Hydrant: pentagon operating nut, chained caps, painted (red/yellow/silver by locality).
7. Weathering: chipped paint at the base, stickers, rust bleed at fixings.

## Materials
`steel_galvanised` (poles, bollards, racks), `steel_painted` / `iron_cast` (heritage posts,
hydrants, bench ends), `wood_weathered` / `oak` slats, `aluminium` sign plates (face colour by
vertex colour), `plastic` bins and signal heads, `glass` lanterns and lenses (glow),
`concrete` bases. Grime: `grime(mesh, { ground: 0.5 })` — splash zone near the ground.

## LOD policy
Instanced hundreds of times: budget hard.
- LOD0: bolts, collars, slats, visors, sign clips. Lamp 1–3k, bench 1–2k, hydrant 1–2k, sign 300–600.
- LOD1: 8-segment columns, slats merged, no bolts. 200–600.
- LOD2: 4–6-sided columns, plates as quads. 20–80. A bollard at LOD2 is 12 triangles.

## QA
```ts
real: { length: 0.5, width: 1.8, height: 0.85, measures: [
  { label: 'seat height', axis: 'z', value: 0.45, parts: ['slat_0'], source: 'catalogue' },
]},
checks: [touches('slat_*', 'frame_*'), symmetric('_l', '_r', 'y')],
```
Traffic light: measure head bottom height (`parts: ['head_0']` z extent offset from the ground) or
add a custom check comparing `bounds('head_*').min.z` to 4.6 m.

## Common mistakes
- Real city logos or invented signs that mimic a real regulatory sign's meaning incorrectly.
- Sign plates double-sided white (backs are bare metal).
- Bench seat at 0.6 m (stool) or 0.3 m (toddler).
- Lamp post without a base plate or with a lantern the size of a car tyre.
- Too many triangles: furniture appears 1,000× in a scene.

## Reuse
`lamp` (heritage lantern and bulkhead), `hex_bolt`, `hex_nut`, `washer` (base plates), `railing`,
`pipe` (bike racks: rigid with fillets), `text` (sign legends), `extrudeSvg` (sign symbols),
`lathe` (columns, hydrants, bollards).

## Sources
- MUTCD 2009 (signs Part 2, signals Part 4): https://mutcd.fhwa.dot.gov/
- UK Traffic Signs Manual: https://www.gov.uk/government/publications/traffic-signs-manual
- Lighting columns EN 40: https://en.wikipedia.org/wiki/Street_light
- Fire hydrants: https://en.wikipedia.org/wiki/Fire_hydrant
