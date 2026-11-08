# Bridge playbook (beam, truss, arch)

Road, rail and foot bridges: girder/beam bridges, trusses (Warren, Pratt, Howe, lattice), arches
(masonry, steel, concrete), plus the basics of suspension and cable-stayed for scenery.
Historic named bridges are good subjects (engineering drawings are often public). Reference for
lattice structures: [`eiffel_tower`](../../../recipes/eiffel_tower/README.md),
[`signal_gantry`](../../../recipes/signal_gantry/README.md). **Scale from the deck width and
clearance**: lane widths, rail gauge and the vertical clearance under the bridge are standardised.

## Research
Span lengths, number of spans, deck width, truss depth and panel count, arch rise, pier
dimensions, clearance below, construction year and material (historic engineering records:
HAER in the US, national heritage lists). Photos: elevation (count panels and verticals), deck
level view, underside (bearings, cross-girders), pier close-up, portal (truss entrance).

| Dimension | Typical | Notes |
|---|---|---|
| road lane width | 3.0–3.75 m | see road playbook |
| footway on bridge | 1.5–2.5 m | |
| parapet / railing height | 1.0–1.15 m (roads), 1.4 m (cycle), rail 1.0–1.8 | EN 1317 / national |
| clearance over road | 5.0–5.3 m (UK 5.03 m min new) | |
| clearance over electrified rail | 4.65–6.5 m | |
| truss depth / span | 1/8–1/12 (simple spans) | |
| girder depth / span | 1/15–1/25 (steel), 1/20–1/30 (continuous) | |
| arch rise / span | 1/4–1/8 | |
| truss panel length | ≈ truss depth (diagonals at 45–60°) | |
| masonry voussoir depth | 1/20–1/30 of span + 0.3 m | |
| rivet / bolt spacing | 0.075–0.15 m | |

## Part tree
```
abutment_a, abutment_b (static: masonry `mass` or concrete) · pier_<i> · bearing_*
├── span_<i> (group per span)
│   ├── chord_top_l/_r, chord_bottom_l/_r, web_* (lattice), portal_*, sway_brace_*
│   ├── deck (slab, `tiled` asphalt or sleepers), cross_girder_*, stringer_*
│   └── parapet_l/_r / railing_*, lamp_*, expansion_joint_*
├── arch_ring (voussoirs), spandrel_*, deck (arch bridges)
└── terrain / river bed for presentation (heightfield + water)
```
Moving bridges: `bascule_leaf` (sway Y at trunnion, 70–80°), `swing_span` (sway Z 90°),
`lift_span` (slide +Z).

## Motion
Static except moving bridges (above) and presentation extras (water emitter, traffic via `ctx.use`).

## Signature details
1. The right truss pattern: Warren (triangles, alternate diagonals), Pratt (diagonals slope toward
   mid-span in tension), Howe (opposite), lattice (multiple crossing diagonals).
2. Gusset plates at every truss joint, with rivet/bolt groups.
3. Bearings at the abutments (rockers, rollers, elastomeric pads); expansion joints at the deck.
4. Portal bracing at the truss ends; top lateral bracing (X) on through trusses.
5. Arch: voussoirs radial to the arch centre, keystone, spandrel walls, cutwaters on piers.
6. Parapets with copings or railings; drainage spouts; lamp posts on long bridges.
7. Weathering: rust streaks below joints, efflorescence on masonry, waterline stain on piers.

## Materials
`steel_painted` trusses (grey, green, red-oxide; original colour), `iron_rust` for old/derelict,
`steel_galvanised` railings, `stone` / `brick` masonry via `mass`, `concrete` decks and piers,
`asphalt` road surface, `wood_weathered` sleepers or footbridge decks, `rock_strata` / `gravel`
banks. Grime: `grime(mesh, { ground: 1 })` relative to the water level, streaks below deck drains.

## LOD policy
- LOD0: gusset plates with rivet rows, chord sections as I/channel (`steel_beam`), bracing, deck
  detail, parapets. 30–150k depending on span count.
- LOD1: members as boxes (`lattice` with simpler `section`), no gussets. 6–20k.
- LOD2: chords + a few diagonals, deck slab, piers. ≤ 1,500. A truss at distance is mostly sky:
  keep members but drop their sides (4-sided → 2-sided `cutout` card if needed).

## QA
```ts
real: { length: 60, width: 9.5, height: 8, measures: [
  { label: 'span', axis: 'x', value: 48, between: ['bearing_a', 'bearing_b'] },
  { label: 'truss depth', axis: 'z', value: 6, parts: ['span_0_web'] },
  { label: 'deck width', axis: 'y', value: 7.3, parts: ['span_0_deck'] },
]},
checks: [touches('span_*', 'bearing_*'), touches('pier_*', 'terrain'), symmetric('_l', '_r', 'y')],
```

## Common mistakes
- Diagonals in the wrong direction for the named truss type.
- Truss too shallow (looks like a fence) or too deep (looks like a building).
- Deck floating: no bearings, no cross-girders.
- Masonry arch with stretched texture and no voussoirs.
- Piers without footing or scour protection where they meet the water.

## Reuse
`lattice` (`pattern: warren | pratt | howe | x`, `bays`, `chord`, `web`), `steel_beam` (IPE/UPN),
`rivet_row`, `railing`, `hex_bolt`, `lamp`, `mass` (masonry abutments), `tiled` (deck),
`heightfield` + water for setting. [Road playbook](road-kerb.md) for the deck surface.

## Sources
- Truss types: https://en.wikipedia.org/wiki/Truss_bridge
- Arch bridges: https://en.wikipedia.org/wiki/Arch_bridge
- HAER (US historic engineering drawings): https://www.loc.gov/pictures/collection/hh/
- Vehicle restraint parapets: EN 1317 (CEN)
