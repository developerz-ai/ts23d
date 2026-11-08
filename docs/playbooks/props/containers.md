# Freight container playbook (ISO 668 series 1)

Dry-van, high-cube, open-top, flat-rack, reefer and tank containers; also container chassis and
stacks for port scenes. A sci-fi variant lives in this repo:
[`cargo_container_scifi`](../../../recipes/cargo_container_scifi/README.md). Use invented owner
codes and liveries — real carriers' logos and colours are trade dress. **Scale from ISO 668**:
width 2,438 mm (8 ft) on every series-1 box; lengths 20 / 40 / 45 ft; heights 8 ft 6 in /
9 ft 6 in.

## Research
ISO 668 (external dimensions and ratings), ISO 1496 (internal dimensions, door openings),
ISO 1161 (corner castings), ISO 6346 (owner code, check digit, size/type code markings), CSC plate
(safety approval). Photos: side (corrugation pitch and count), doors (locking bars, cams, hinges),
front end wall, roof (dents), underside (forklift pockets on 20 ft, gooseneck tunnel on 40 ft),
corner casting close-up.

| Dimension | 20 ft | 40 ft | 40 ft HC | Source |
|---|---|---|---|---|
| length | 6,058 mm | 12,192 | 12,192 | ISO 668 |
| width | 2,438 | 2,438 | 2,438 | ISO 668 |
| height | 2,591 | 2,591 | 2,896 | ISO 668 |
| door opening (W × H) | 2,286 × 2,261 min | same | 2,286 × 2,566 | ISO 1496-1 |
| corner casting | 178 × 162 × 118 mm, oval top hole | | | ISO 1161 |
| corrugation pitch (side) | ≈ 278 mm trapezoid, 36 mm deep (typical) | | | measure from photo |
| floor | 28 mm marine plywood on cross-members | | | |
| forklift pockets (20 ft) | 2 at 2,050 mm centres, 360 × 115 mm | | | ISO 1496 (optional) |
| tare / max gross | 2.2 t / 30.5 t | 3.7 / 30.5 | 3.9 / 30.5 | typical |
| 45 ft | 13,716 long | | | ISO 668 |

## Part tree
```
container (static: frame rails, corner posts, end wall, side walls, roof)
├── corner_casting_<i> (8; sockets attach for twistlocks and spreader)
├── door_l / door_r (sway Z at the outer hinges, 270°) → locking_bar_<i> (sway about own axis ±90°),
│   cam_*, handle_* (sway), seal (rubber)
├── floor, cross_member_*, forklift_pocket_* (20 ft), gooseneck_tunnel (40 ft)
├── vent_* (2 small grilles near the top), csc_plate, marking_* (text: owner code, size type)
└── reefer: machinery_unit (front), display (glow), cable
```

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| doors | sway `oneWay` | Z at hinge pins | 270° (to lie against the sides) |
| locking bars | sway | own vertical axis | 90° (cam release) |
| bar handles | sway | Y | 90° up |

Open order matters: handles up → bars turn → doors swing. Right door overlaps the left (the right
door must open first) on most boxes.

## Signature details
1. Trapezoidal corrugation on sides, roof (shallower) and front end; doors with vertical ribs.
2. Corner castings at all 8 corners, slightly proud of the walls, with the oval holes.
3. Four locking bars across the doors with cams top and bottom, hinges on the outer edges.
4. ISO 6346 markings: owner code + serial + check digit (invent: e.g. `TSDU 123456 7`),
   size/type `22G1` / `42G1` / `45G1`, max gross / tare panel, CSC plate on the left door.
5. Door seal gaskets; customs seal on a handle.
6. Dents, scrapes and rust at the bottom rails and corners; paint touch-ups in mismatched colour.

## Materials
`steel_painted` walls (Corten weathering steel painted; original colour), `iron_cast` corner
castings, `steel_galvanised` locking bars and hinges, `wood_weathered` (plywood floor), `rubber`
seals, `plastic` / `aluminium` reefer unit, `text` markings in white/black. Grime: rust bleed
from corners and bottom rail, dirt streaks from the roof, salt spray.

## LOD policy
- LOD0: corrugation as geometry, locking bars with cams and keepers, hinges, castings with
  holes, markings. 4–10k per box.
- LOD1: corrugation as a few folds or a normal-mapped strip, bars as cylinders. 600–1,500.
- LOD2: a bevelled box with dark door seam. 12–40.
Port stacks hold thousands: LOD2 must be a box.

## QA
```ts
real: { length: 6.058, width: 2.438, height: 2.591, measures: [
  { label: 'external length (20 ft)', axis: 'x', value: 6.058, parts: ['container'], source: 'ISO 668' },
  { label: 'external width', axis: 'y', value: 2.438, parts: ['container'], source: 'ISO 668' },
  { label: 'corner casting', axis: 'x', value: 0.178, parts: ['corner_casting_0'], source: 'ISO 1161' },
]},
checks: [touches('door_*', 'container'), touches('corner_casting_*', 'container'), symmetric('_l', '_r', 'y')],
gaps: [{ parts: ['door_l', 'door_r'], why: 'door seal seam' }],
```
Tolerance is tight on ISO boxes — they must stack with every other container in the scene.

## Common mistakes
- Width or height off (a 2.5 m container won't stack); corner castings missing.
- Corrugation running horizontally, or flat sides.
- Doors hinged in the middle; bars without cams.
- Real carrier logos, or a real owner code (BIC codes are registered — invent one, ideally with a
  `U` category letter but an unregistered prefix, and say so in the dossier).

## Reuse
`hinge`, `rivet_row`, `hex_bolt`, `text` (markings), `steel_beam` (bottom rails, cross-members),
`lattice` (flat-rack ends), `ladder` (tank container). Handling equipment: [truck](../vehicles/truck.md)
container chassis, [forklift](../vehicles/forklift.md).

## Sources
- ISO 668: https://en.wikipedia.org/wiki/ISO_668
- 20 ft external sizes and casting: https://www.kscranegroup.com/posts/shipping-container-dimensions-types-and-corner-casting-guide/
- Corner casting technical documentation: https://hz-containers.com/en/technical-information/corner-castings-technical-documentation/
- ISO 6346 markings: https://en.wikipedia.org/wiki/ISO_6346
- Intermodal container overview: https://en.wikipedia.org/wiki/Intermodal_container
