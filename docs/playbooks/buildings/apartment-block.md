# Apartment block playbook

Residential blocks of 3–15 storeys: perimeter blocks (European city), slab blocks (post-war
prefab panels), point towers, walk-ups, mansion blocks. **Scale from the storey height and the
balcony guard**: residential floor-to-floor is 2.8–3.2 m; guards are 1.0–1.1 m everywhere.

## Research
Planning drawings or listing descriptions (storeys, bay width, construction), regional codes for
guard height and stair geometry, panel-system catalogues for prefab blocks (panel sizes are
modular: 1.2 m / 0.6 m grids, 2.8 m storey). Photos: street elevation square-on (count bays and
floors), corner, courtyard side, entrance, roofline (parapet, plant rooms, lift overrun), balcony
close-ups.

| Dimension | Typical | Notes |
|---|---|---|
| floor-to-floor | 2.8–3.2 m (modern), 3.3–3.8 (19th-century mansion block) | |
| ground floor (with shops) | 3.5–4.5 m | see shop-front playbook |
| structural bay | 3.6–7.2 m (prefab panel grids 3.6 / 6.0 m) | |
| building depth | 10–14 m (dual aspect), 16–20 (corridor) | |
| balcony depth | 1.2–2.0 m projecting; loggia recessed 1.5–2.0 | |
| balcony guard | 1.0–1.1 m | EN 1991-1-1 loads; codes set heights (UK 1.1 m) |
| window (living) | 1.2–2.4 m wide × 1.4–1.6 m tall, sill 0.6–0.9 m | French windows to the floor |
| parapet | 0.3–1.1 m | |
| lift overrun / plant room | 2.5–4 m above roof | |
| entrance door | 1.0–1.2 m single, 1.8–2.0 m double | |

## Part tree
```
mass_<tier> (static: `mass` or `box`; corners and setbacks per tier)
├── win_<side>_<floor>_<bay> (facade + opening kit) · balcony_<side>_<floor>_<bay> (slab + guard)
├── entrance (canopy, door_entrance_l/_r sway Z, intercom panel, steps/ramp)
├── roof_parapet, roof_plant, lift_overrun, antenna_* · stair_core (expressed or internal)
├── downpipe_*, string_course_*, cornice
└── shop_* on the ground floor (ctx.use a shop-front asset)
```
Large blocks: build one bay as a mesh, `place` it along the elevation with `ctx.rng` variations
(curtains, blinds, plants, AC units), then `merge` per facade for draw-call economy.

## Motion
Mostly static. Optional: entrance doors (sway `oneWay` 90°), roller shutters on shops
(slide `oneWay` +Z), awnings (sway), flags (sway). Window glow at night: declare `glow` on a
seeded subset of `win_*_glass` parts.

## Signature details
1. Rhythm: regular bays, with variation in use (curtains half drawn, blinds, plants, laundry).
2. Balconies with real slab thickness (0.15–0.25 m), drip edge, guard of railings or glass.
3. Recessed windows with sills that throw a shadow line; panel joints on prefab blocks.
4. Ground floor treated differently: plinth, entrance canopy, shops or rusticated base.
5. Roof: parapet coping, lift overrun, vents, antennas, satellite dishes.
6. Corner treatment: chamfer, bay or turret on period blocks.
7. AC units, pipes, downpipes and signage add the lived-in read.

## Materials
`concrete` (panels, slabs), `brick` / `stone` (period blocks), `plain` render tinted,
`glass` windows (vary tint and reflectance with vertex colour), `steel_galvanised` / `steel_painted`
balcony rails, `aluminium` window frames, `plastic` blinds and AC units, `canvas` awnings.
Grime: streaks under every sill and balcony drip, darker ground floor, moss at parapet joints.

## LOD policy
- LOD0: reveals, sills, balcony guards as bars, curtains/blinds as interior cards behind glass,
  AC units, pipes. Per bay 300–1,000 tris; a 6-storey block 30–80k.
- LOD1: openings as inset glass panels, balconies as slabs + solid guard. 5–15k.
- LOD2: mass boxes, roof plant, window grid in the texture. 300–800.
Instance identical bays; LOD2 must stay one mesh per mass.

## QA
```ts
real: { length: 14, width: 48, height: 22.5, measures: [
  { label: 'storey height', axis: 'z', value: 3.0, between: ['balcony_front_1_0', 'balcony_front_2_0'] },
  { label: 'balcony guard height', axis: 'z', value: 1.1, parts: ['balcony_front_1_0_guard'] },
]},
checks: [touches('balcony_*', 'mass_*'), noOverlap('balcony_*')],
```

## Common mistakes
- Storeys of 4 m with windows of a house: the block reads as a giant dollhouse.
- Flat texture windows with no depth; every window identical with no life behind it.
- Balconies as thin boards with no slab edge or drip; guards below 0.9 m.
- Repeated seeds so every block in a scene is the same.

## Reuse
`facade` (split grammar per floor), `setbacks` (stepped towers), `mass`, `opening`, `roof`
(mansard for period blocks), parts `railing` (balcony guards: set the handrail to 1.1 m),
`casement_window`, `panel_door`, `pipe` (downpipes), `lamp`.

## Sources
- Guard heights: UK Approved Document K, https://www.gov.uk/government/publications/protection-from-falling-collision-and-impact-approved-document-k
- Prefab panel systems: https://en.wikipedia.org/wiki/Panel_building · https://en.wikipedia.org/wiki/Plattenbau
- Perimeter block: https://en.wikipedia.org/wiki/Perimeter_block
