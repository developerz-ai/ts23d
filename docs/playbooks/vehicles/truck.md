# Truck playbook (semi tractor, trailer, rigid truck)

Heavy goods vehicles: cab-over (Europe, Asia) or conventional bonneted (North America) tractor
units, semi-trailers (box, curtainsider, flatbed, tanker, container chassis), rigid trucks.
Original designs only — no maker grilles or badges. **Scale from the legal envelope and the
wheel**: road-legal maxima are law, and truck tyres are `315/80 R22.5` (Ø ≈ 1.07 m) or
`385/65 R22.5` (Ø ≈ 1.07 m, trailer).

## Research
Regulation first (EU Directive 96/53/EC Annex I; US Federal size regulations, 23 CFR 658), then a
manufacturer cab dimension sheet (cab width, cab floor height, fifth-wheel height, wheelbase
options), then a trailer builder's sheet (internal length, deck height, kingpin setback). Photos:
side of the combination, tractor 3/4 front, chassis behind the cab (fifth wheel, air lines,
fuel tanks), trailer rear (doors, lamps, underrun bar), landing legs close-up.

| Dimension | EU | North America | Source |
|---|---|---|---|
| max width | 2.55 m (2.60 refrigerated) | 2.59 m (102 in) | 96/53/EC Annex I · 23 CFR 658.15 |
| max height | 4.00 m | none federal; 4.11–4.27 m by state | 96/53/EC |
| max length, articulated | 16.50 m | trailer 14.63–16.15 m (48–53 ft) | 96/53/EC · state law |
| semi-trailer kingpin to rear | 12.0 m | — | 96/53/EC |
| standard trailer (box) | 13.6 m long | 53 ft = 16.15 m | |
| fifth-wheel height | 0.95–1.15 m (low-deck 0.9) | 1.17–1.27 m | maker sheets, typical |
| deck height (laden) | 1.10–1.30 m (mega 0.95) | 1.22–1.32 | typical |
| cab-over cab length | 2.2–2.5 m | conventional bonnet tractor 6.5–7.5 m overall | |
| tractor wheelbase (4×2) | 3.6–3.9 m | 4.3–6.0 m (6×4) | |
| tyre Ø 22.5 in | 1.05–1.08 m | 1.03–1.08 | ETRTO / TRA |
| trailer axle spread (tri-axle) | 1.31 m between axles | 1.24 m tandem | |

## Part tree
```
tractor
├── chassis (frame rails, cross-members) · cab (static shell; tilts on cab-overs: sway Y at front pivot, 60°)
├── door_l, door_r (sway Z) · glass_* · mirror_* (big: 2 per side + kerb mirror)
├── axle_f (steer: steer_f_l/_r sway Z ±45°) · axle_r_0, axle_r_1 (drive, twin wheels each side)
├── fuel_tank_l/_r, battery_box, air_tank_*, exhaust_stack / silencer, steps_*
├── fifth_wheel (pivot: sway Y ±10° articulation, socket 'attach' at kingpin centre)
└── emitter exhaust (smoke, moving)
trailer (separate asset; ctx.use for the combination)
├── body (box / curtains / deck) · kingpin (socket attach) · landing_leg_l/_r (slide Z)
├── axle_0..2 (spin Y; lift axle slide +Z) · rear_door_l/_r (sway Z 270°) · underrun_bar
└── lamps (glow), side_underrun_*, mudflaps_*
```
Twin wheels: `axle_r_0_wheel_l_outer` / `_inner`; both on the spinning axle group.

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| wheels / axles | spin | Y | |
| steer knuckles | sway | Z | ±40–45° |
| tilt cab (cab-over) | sway `oneWay` | Y at front pivot | 55–70° forward |
| trailer on fifth wheel | sway | Z at kingpin | ±90° (articulation, engine-driven) |
| landing legs | slide `oneWay` | −Z | 0.3–0.5 m |
| rear barn doors | sway `oneWay` | Z at outer hinge | 270° to the sides |
| lift axle | slide `oneWay` | +Z | 0.15–0.25 m |

## Signature details
1. Twin rear tyres; hub nuts on a 10-stud ISO circle (335 mm PCD); hubcap covers on steer axle.
2. Cab steps (3–4) with grab handles; cab floor 1.2–1.5 m up.
3. Large mirror arms; sun visor; roof deflector on long-haul cabs.
4. Chassis clutter between cab and fifth wheel: air/electric suzies (coiled lines), tanks, toolbox.
5. Side underrun guards, rear underrun bar, mudflaps behind each axle group.
6. Trailer: corner posts, rear lamp clusters, reflective conspicuity tape (red/white or yellow).
7. Landing legs with crank handle; spare wheel carrier under the trailer.
8. Visible 5–10 mm gaps around the cab tilt seam and doors.

## Materials
`steel_painted` cab (vertex colour) and chassis (black/dark red), `aluminium` fuel tanks, rims,
trailer posts and rails, `steel_galvanised` trailer chassis and underrun bars, `canvas` curtains
(curtainsider), `plywood`-like box sides via `plastic` white or `aluminium` panels, `rubber`
tyres and mudflaps, `chrome` grille trim and stacks, `glass`. Grime: road spray up the trailer
rear and cab sides, black exhaust soot on stacks.

## LOD policy
- LOD0: chassis plumbing, wheel nuts, suzies (`pipe` hose), steps, mirror arms, conspicuity tape,
  door hinges and locking bars. Tractor 40–80k, trailer 20–40k.
- LOD1: tanks and steps blocked, wheels 16 segments, no nuts. 8–15k / 4–8k.
- LOD2: cab box, chassis box, wheels 8 segments, trailer box. ≤ 1,500 each.

## QA
```ts
real: { length: 16.5, width: 2.55, height: 4.0, measures: [
  { label: 'tyre diameter', axis: 'z', value: 1.07, parts: ['axle_f_wheel_l'], source: '315/80 R22.5' },
  { label: 'trailer length', axis: 'x', value: 13.6, parts: ['trailer_body'] },
  { label: 'fifth wheel height', axis: 'z', value: 1.15, parts: ['fifth_wheel'] },
]},
checks: [touches('trailer_kingpin', 'fifth_wheel'), clear('axle_*', 'chassis', 0.02),
         symmetric('_l', '_r', 'y')],
```

## Common mistakes
- Trailer deck floating above the fifth wheel, or kingpin not at the fifth-wheel centre.
- Single rear wheels on a tractor; wheels car-sized.
- Overall height above 4.0 m (EU) or width above 2.55 m.
- Empty chassis between cab and trailer — reads as a toy.
- Cab windows at car height; real windscreen bottom is ~1.8 m up.

## Reuse
`wheel` (`spokes: 0`, steel disc with hand holes as detail), `axle`, `pipe` (air lines, exhaust),
`steel_beam` UPN (frame rails), `ladder` (cab access on tankers), `railing`, `hex_nut`,
`lamp` (bulkhead work lights). Container chassis: [containers playbook](../props/containers.md).

## Sources
- EU dimensions: Council Directive 96/53/EC Annex I, https://www.legislation.gov.uk/eudr/1996/53/annex/I
- US: 23 CFR Part 658, https://www.ecfr.gov/current/title-23/chapter-I/subchapter-G/part-658
- Tyre sizes: https://en.wikipedia.org/wiki/Tire_code
- Semi-trailer types: https://en.wikipedia.org/wiki/Semi-trailer
