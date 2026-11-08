# Water features playbook

Ponds, lakes, rivers and streams, waterfalls, canals, fountains, wells, troughs, puddles. A glTF
asset ships the **geometry and the banks**; animated water shading belongs to the engine. Produce
a clean water surface part (`surface: 'glass'` or `'translucent'` with the `water` strip), the
bed under it and the shore around it. **Scale from the edge**: bank heights, kerbs of fountains
and trough rims are human-scaled.

## Research
Hydrology basics (channel width:depth, meanders, pool–riffle spacing), garden and civil designs
for built features (fountain basins, canal locks, wells), photos of the shore at the waterline
(the transition sells it: wet band, debris, reeds).

| Feature | Typical | Notes |
|---|---|---|
| garden pond | 1–10 m, 0.45–1.0 m deep, shelf at 0.2–0.3 m for marginal plants | |
| stream | 1–5 m wide, 0.2–1 m deep | |
| river | width:depth 10–20:1 | |
| pool–riffle spacing | 5–7 × channel width | |
| canal (narrow, UK) | 9–15 m wide, 1.2–2 m deep; lock 2.1 × 22 m | |
| fountain basin wall | 0.4–0.6 m high, 0.3–0.5 thick coping (sitting height) | |
| well | Ø 1–1.5 m, wall 0.6–0.9 high, roof 2–2.5 m | |
| horse / stone trough | 1.5–2.5 × 0.5–0.7 × 0.5 m | |
| waterfall (presentation) | lip overhang, plunge pool 1–2× the fall's width | |

## Part tree
```
bed (heightfield or lathe for basins: below the surface) · bank / coping / shore
├── water (single surface part: surface 'glass' or 'translucent', strip `water`)
├── reeds_*, lily_pad_* (cutout cards), stones_*, debris_*
├── fountain: basin, column, bowl_<i>, spout_* (emitter: water / steam kind for spray)
└── waterfall: lip rocks, falling sheet (translucent cards), emitter mist at the foot
```

## Motion
Water flow is an engine shader concern. In-asset motion: floating objects (sway ±3°), mill wheels
(spin Y), fountain jets as emitters (`kind: 'steam'` as a stand-in for spray, `rate`, `dir: +Z`).

## Signature details
1. The water plane meets the bank inside a slope, not at a vertical wall (except built features).
2. Wet band 0.05–0.2 m above the waterline darker and smoother; algae/moss line on stone.
3. Bed visible in shallows: stones, sand, darker deeper (vertex colour on the bed by depth).
4. Marginal plants: reeds, rushes, lily pads; leaves and debris collected in eddies.
5. Built features: coping stones with overhang, spouts, overflow, drain grate.
6. Waterfalls: lip, sheet thinning as it falls, foam at the base, mist.

## Materials
`water` strip with `glass` / `translucent` surface for the plane, `mud` / `sand` / `gravel` /
`cobblestone` beds, `stone` / `concrete` / `brick` built edges, `moss` along the wet band,
`wood_weathered` jetties and well frames, `iron_rust` pumps and grates, `copper` (verdigris)
fountain spouts.

## LOD policy
- LOD0: shoreline detail (stones, reeds), bed geometry, fountain mouldings. 5–40k.
- LOD1: plane + simplified bank, cards reduced. 1–5k.
- LOD2: plane and rim. 20–200.
The water surface itself can be a few triangles at every LOD; spend on the shore.

## QA
```ts
real: { length: 3.0, width: 3.0, height: 0.6, measures: [
  { label: 'basin wall height', axis: 'z', value: 0.5, parts: ['basin_wall'] },
]},
checks: [touches('water', 'basin_wall'), clear('water', 'coping', 0.0)],
gaps: [{ parts: ['water', 'bank'], why: 'water surface meets the sloped bank' }],
```

## Common mistakes
- A blue box: opaque water with no bed beneath.
- Water plane floating above the bank or z-fighting with it.
- Uniform bank with no wet band or vegetation.
- Animated water baked into geometry (engines do this better with shaders).

## Reuse
`heightfield` (beds and banks), `lathe` (basins, bowls, wells), `mass` (masonry edges), `pipe`
(spouts), `sculpt` (rocks), [rocks](rocks.md), [plants](plants.md), [terrain](terrain.md),
[`hull`](../vehicles/boat.md) for boats on it.

## Sources
- River channel geometry: https://en.wikipedia.org/wiki/Fluvial_geomorphology · https://en.wikipedia.org/wiki/Meander
- Pool–riffle sequence: https://en.wikipedia.org/wiki/Pool_riffle_sequence
- Canal locks: https://en.wikipedia.org/wiki/Lock_(water_navigation)
