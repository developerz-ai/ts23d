# Station and platform playbook

Railway halts and small stations: platforms, canopies, shelters, footbridges, booking halls,
signage; tram and bus stops share the scale cues. Reference recipes:
[`station_halt`](../../../recipes/station_halt/README.md),
[`signal_gantry`](../../../recipes/signal_gantry/README.md),
[`water_tower`](../../../recipes/water_tower/README.md). **Scale from platform height and the
track**: platform height is standardised per network and the 1.435 m gauge sits beside it.

## Research
Network standards for platform height and offset from the track centre (UK Network Rail /
RSSB GI/RT7016, EU TSI PRM, US ADA level boarding), canopy clearance, tactile paving rules,
station architecture by railway company and era. Photos: platform along its length, canopy
structure (brackets, valance), footbridge, platform edge and coping, signs and lamps.

| Dimension | Typical | Notes / source |
|---|---|---|
| platform height (UK) | 0.915 m above rail | RSSB GI/RT7016 |
| platform height (EU TSI) | 0.55 m or 0.76 m | TSI PRM |
| platform height (US) | 0.2 m low-level, 1.22 m high-level (48 in) | |
| platform edge offset | 0.73 m from the nearest rail (UK, ≈ 1.45 m from track centre) | |
| platform width | ≥ 2.5–3 m side platform, ≥ 4–6 m island | |
| platform length | 80–300 m (halts 1–2 coach lengths) | |
| canopy clearance | 2.4–3.0 m to underside of valance | |
| coping stone | 0.3–0.6 m deep, white line 0.1 m + tactile 0.4 m strip | |
| footbridge clearance over rail | ≥ 4.65–5.0 m (electrified 6+) | |
| stair rise / going (public) | 150–170 / 280–300 mm | |
| station nameboard | 1.5–3 m long, 0.3–0.6 m tall, top ~2.5 m | |

## Part tree
```
platform (static: wall, fill, coping, surface) · tactile_strip · edge_line
├── canopy (columns_*, brackets_*, roof, valance_* with cutout fretwork)
├── shelter (glass panels, bench, roof) · building (ctx.use a house-like booking hall)
├── nameboard_* (text), lamp_* (glow), clock, bench_*, bin_*, cctv_*
├── footbridge (lattice or beam deck, stairs_*, railing_*)
├── track (rails, sleepers, ballast) for presentation
└── sockets: spawn (passenger points along the edge), audio (announcement)
```

## Motion
Mostly static: clock hands (spin Y, slow), hanging signs (sway), level-crossing barriers (sway
`oneWay` 90°), departure board flaps. Signals belong to [`signal_gantry`](../../../recipes/signal_gantry/README.md).

## Signature details
1. Platform edge: coping with overhang toward the track, white line, tactile paving (yellow blisters).
2. Canopy: cast-iron columns with brackets, timber valance with saw-tooth fretwork (period), or
   steel and glass (modern).
3. Nameboard with the station name (invented or historic), lamp posts, benches, bins.
4. Ramp at the platform end, fencing behind, steps or a footbridge across.
5. Track beside: ballast shoulder, sleepers, check rails on curves.
6. Clock, timetable boards, posters (generic).
7. Weathered surfaces: worn asphalt or flagstones, rust stains under columns.

## Materials
`concrete` / `stone` platform walls and coping, `asphalt` / `cobblestone` surfaces, `iron_cast`
columns and brackets (painted via `steel_painted` for colour), `wood_painted` valance and
benches, `glass` canopy and shelters, `slate` roofs, `brick` buildings, `steel_galvanised` fences,
`plastic` yellow tactile strip. Grime: dark band of brake dust and oil on the platform wall face.

## LOD policy
- LOD0: valance fretwork (`cutout` or extruded SVG), column capitals (`lathe`), tactile dots as a
  texture strip, benches and lamps with detail. 15–60k for a halt.
- LOD1: canopy as roof + simple valance, columns 8 segments. 4–10k.
- LOD2: platform box, canopy slab, building box. ≤ 800.

## QA
```ts
real: { length: 60, width: 6, height: 4.5, measures: [
  { label: 'platform height above rail', axis: 'z', value: 0.915, parts: ['platform'], source: 'GI/RT7016' },
  { label: 'canopy clearance', axis: 'z', value: 2.6, parts: ['canopy_column_0'] },
]},
checks: [touches('canopy_column_*', 'platform'), touches('nameboard_*', 'platform'), noOverlap('bench_*')],
```
Measure platform height from rail top: model the rail top at z = 0 or offset the measure parts.

## Common mistakes
- Platform at road-kerb height (0.15 m) or at 1.5 m.
- Platform edge flush to the track centre (trains would hit it) or 2 m away.
- Canopy too low (< 2.4 m) or columns too thick for cast iron.
- No tactile strip or edge line on a modern station.

## Reuse
`lattice` (footbridges), `steel_beam`, `railing`, `lamp`, `text` (nameboards), `extrudeSvg`
(valance fretwork), `roof` (canopy), `tiled` (paving), street furniture from
[street furniture](street-furniture.md), track from [rail](../vehicles/rail.md).

## Sources
- Platform heights: https://en.wikipedia.org/wiki/Railway_platform_height
- RSSB GI/RT7016 (UK station infrastructure): https://www.rssb.co.uk/standards-catalogue
- TSI PRM (EU accessibility): https://www.era.europa.eu/domains/technical-specifications-interoperability_en
- Tactile paving: https://en.wikipedia.org/wiki/Tactile_paving
