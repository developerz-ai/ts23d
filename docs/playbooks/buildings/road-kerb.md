# Road, kerb and markings playbook

Carriageways, kerbs, footways (sidewalks), gutters, drains, crossings and road markings, as
modular tiles for scenes. Markings follow real regulations because drivers read them instantly.
**Scale from the lane width and kerb face**: a lane is 2.75–3.75 m, a kerb face 100–150 mm.

## Research
National design manuals (UK DMRB and Manual for Streets, US AASHTO "Green Book" and MUTCD Part 3
for markings, EU national equivalents), kerb product standards (BS EN 1340 concrete kerbs; UK HB2
profile), drainage gully sizes. Photos: plan from above (aerial imagery), kerb section, crossing,
junction corner, gully and manhole close-ups.

| Dimension | Typical | Source / note |
|---|---|---|
| lane width | 3.65 m (UK trunk, US interstate 12 ft) · 3.0–3.25 urban · 2.75 min | DMRB CD 127 / AASHTO |
| kerb face (upstand) | 100–150 mm (UK 125 mm standard) | Hertfordshire standard detail; BS EN 1340 |
| kerb unit (UK HB2) | 125 × 255 × 914 mm, half-battered | BS 7263 / BS EN 1340 |
| US curb | 150 mm (6 in) face, 150–200 mm wide, often curb-and-gutter 0.6 m | |
| dropped kerb (crossing) | 0–6 mm upstand | accessibility |
| footway width | 2.0 m desirable, 1.5 min | Manual for Streets / Inclusive Mobility |
| crossfall | 2.5 % carriageway, 2 % footway | |
| centre line (UK) | 100 mm wide dashes 4 m line / 8 m gap (urban) | Traffic Signs Manual ch. 5 |
| edge / lane line (US) | 4–6 in (100–150 mm), broken 10 ft line / 30 ft gap | MUTCD 3A/3B |
| zebra stripes | 0.5–0.6 m wide, crossing ≥ 2.4 m | |
| stop line | 200–300 mm (UK), 12–24 in (US) | |
| gully grate | 450 × 450 mm or 300 × 500 | |
| manhole cover | 600 × 600 or Ø 600 mm | EN 124 |

## Part tree
```
road_tile (group: one straight / junction / bend module, 10–20 m long)
├── carriageway (asphalt, crowned or crossfall) · markings_* (decals: planar 1–2 mm above)
├── kerb_l / kerb_r (swept profile along the path) · channel_* · dropped_kerb_*
├── footway_l/_r (paving `tiled`, raised to kerb top) · tactile_* at crossings
├── gully_* (grate), manhole_*, verge / grass strip, street furniture via ctx.use
└── sockets: spawn (lane centres), attach (signal and sign positions)
```
Author a straight, a bend and a T-junction as a family (`length`, `lanes`, `footway`), then tile
them in a scene with `ctx.use`.

## Motion
Static. Optional emitters: steam from manholes, water from drains for presentation.

## Signature details
1. Kerb upstand with a batter or bullnose, joints every 0.9–1.0 m, dropped at crossings.
2. Channel (gutter) line along the kerb, darker and dirtier.
3. Asphalt patched: repairs as slightly different tone rectangles, cracks, worn wheel paths.
4. Markings worn in the wheel tracks; reflective thermoplastic slightly raised.
5. Drainage: gullies at the kerb every 20–40 m, manholes mid-lane.
6. Footway: paving slab module 600 × 600 or 450 × 600, block paving, or asphalt; utility covers.
7. Camber: the road is higher at the centre; the eye reads flat roads as wrong at grazing light.

## Materials
`asphalt` carriageway, `concrete` kerbs (or `stone` granite kerbs, `cobblestone` setts),
`plain` white / yellow markings (vertex colour), `iron_cast` grates and covers, `concrete` /
`stone` paving, `grass` / `soil` verges, `gravel` shoulders. Grime: oil drips mid-lane, tyre
marks at stop lines, dirt in the channel.

## LOD policy
- LOD0: kerb profile with chamfers and joints, gratings with bars, markings as geometry decals,
  paving joints as geometry or `tiled` strip. 1–5k per 10 m tile.
- LOD1: kerbs 4-sided, markings kept, gullies as quads. 200–600.
- LOD2: road strip + footway strips, markings as quads. 20–60.
Markings must not z-fight: lift 2 mm or cut them into the asphalt mesh.

## QA
```ts
real: { length: 10, width: 12, height: 0.25, measures: [
  { label: 'lane width', axis: 'y', value: 3.65, parts: ['lane_0'], source: 'DMRB CD 127' },
  { label: 'kerb face', axis: 'z', value: 0.125, parts: ['kerb_l_face'] },
]},
checks: [touches('kerb_*', 'carriageway'), touches('footway_*', 'kerb_*')],
```

## Common mistakes
- Kerbs 300 mm high (a step, not a kerb) or none at all.
- Lanes 5 m wide; markings too thick, too long or the wrong colour for the region (yellow centre
  lines are North American).
- Pristine asphalt with no patching or wear.
- Markings z-fighting with the road surface.

## Reuse
`sweep` (kerb profiles along a path), `tiled` (paving), `heightfield` (verges), `text` (road
legends like SLOW, invented place names), [street furniture](street-furniture.md),
[bridge](bridge.md) for decks.

## Sources
- UK DMRB: https://www.standardsforhighways.co.uk/dmrb/
- Manual for Streets: https://www.gov.uk/government/publications/manual-for-streets
- MUTCD Part 3 markings: https://mutcd.fhwa.dot.gov/
- Kerb detail (125 mm face, BS EN 1340): https://www.hertfordshire.gov.uk/media-library/documents/highways/standard-drawings/pdf/hst-1100-001-kerbs-footways-construction-details-notes.pdf
- Road surface markings: https://en.wikipedia.org/wiki/Road_surface_marking
