# Country station — GWR standard brick building, Toddington (1904) (`station_halt`)

## Identity
The Great Western Railway's standard small brick station of c. 1900, as at Toddington
(Honeybourne line, opened 1 Dec 1904; restored by the Gloucestershire Warwickshire Railway and the
basis of the Bachmann/Scenecraft "GWR standard station"). Chosen because it is the archetypal
British country station and is photographed from every side. Signature features: one-storey red
brick building with a blue-brick plinth, segment-headed sash windows and panelled doors all opening
onto the platform, a steep slate gable roof with tall brick stacks, a deep platform canopy with a
fretted timber valance in GWR chocolate & cream, a brick-faced platform with a pale stone coping,
benches against the wall, oil/gas lamps and a black running-in name board.

## Specs
| Dimension | Value (m) | Source |
|---|---|---|
| platform height over rail | 0.915 (3 ft, UK standard) | https://en.wikipedia.org/wiki/Railway_platform_height |
| platform length (real) | 120 (400 ft); a 30 m section is modelled | https://en.wikipedia.org/wiki/Toddington_railway_station |
| building footprint | ≈ 20.0 × 6.4 | ESTIMATE: scaled from the photos (doors 2.1 m, people 1.75 m) |
| wall height (platform → eaves) | ≈ 3.9 | ESTIMATE, same photos |
| roof pitch | ≈ 33° | ESTIMATE, gable end in the photo |
| canopy depth / valance | ≈ 3.4 / 0.5 | ESTIMATE, platform photo |
| brick course | 0.075 (UK brick 65 mm + 10 mm joint) | `station_brick` strip (the house bond, true scale) |
| chimney stack over the slates | ≈ 1.6 | ESTIMATE, Toddington photos (stack ≈ a third of the roof rise) |

## Photos (by view)
| View | URL | Notes |
|---|---|---|
| 3/4 from the opposite platform | https://commons.wikimedia.org/wiki/File:Toddington_Railway_Station_GWSR_001.jpg | gable end, canopy + valance, stacks, name board, platform coping |
| along the platform | https://commons.wikimedia.org/wiki/File:Toddington_railway_station_1.jpg | canopy underside, clock, benches with cast "GWR" ends, sign boards |
| road side | https://commons.wikimedia.org/wiki/File:Toddington_railway_station9.4.05.jpg | back elevation |
| model of the type | https://www.bachmann.co.uk/product/gwr-standard-station---chocolate-and-cream/44-1019 | the standard design, based on Toddington |

## Parts the engine needs
`platform`, `building`, `roof`, `canopy` (static) · `lamp_*` (glow) · sockets `bench_*` (seat),
`door_*` (interact) · emitters `chimney_*` (smoke).

## Modelling notes (2026-11 quality passes)
- Roof: slate courses laid over the library roof slab (`slates.ts`), 0.24 m gauge, each course a
  shallow wedge whose 12 mm butt casts the course line, split into runs of slates with their own
  tone; lichen on the shaded (−X) slope, engine soot on the lowest track-side courses. LOD1 keeps
  courses at double gauge; LOD2 the slab.
- Materials (`materials.ts`): `station_brick` is the house bond with a wider per-brick spread
  and a painted tone per course (and now and then a darker over-burnt run), on the walls, plinth,
  stacks and reveals; `station_canopy_felt` is roll-top felt on boarding (a raised, lighter
  batten every 0.45 m down the slope) on the canopy deck; `station_board_name` paints
  "TODDINGTON" white on black for the far name board.
- Wear: rising damp above the blue plinth and damp stains under every front sill (LOD0), soot
  under the eaves; the canopy deck, soffit and valance sooted toward the track edge; lichen and a
  trodden band on the platform, a dark dirt band fading in from behind the coping (LOD0/1);
  coping in 0.9 m slabs with 12 mm joints, each its own tone (LOD0); rise-and-fall gutter
  brackets; valance fret kept at LOD1.
- LOD2: the platform flags stay at true scale (a single stretched band read as planks); the name
  board keeps its lettering as one quad of `station_board_name`. The brick walls and the two gables
  keep their courses at true scale too (`far.ts`: the walls' LOD1 banded faces, the gable infill of
  the LOD1 roof on LOD2's bare slopes); one stretched band read as vertical red timber planks. The
  far windows and doors keep only their face, 3 mm off the brick, which pays for it (436 tris).
- Hero: the default 3/4 orbit at 12° elevation, low enough to see under the canopy.
- Triangles: 10.0k / 5.5k / 528 (budget 10.5k / 5.8k / 550).

## Open questions
- Toddington's canopy is cantilevered from the wall on brackets; this model carries its front edge on
  cast-iron columns (the other common GWR arrangement and the brief's ask). Flagged deviation.
- No measured drawing was found online; building and canopy dimensions are photo estimates.
