# SUV and pickup playbook

Crossovers (monocoque, car-like), body-on-frame SUVs and pickups (ladder frame, separate cab and
bed). Read [passenger car](passenger-car.md) first: tyre arithmetic, doors and glazing are the same.
**Scale from the tyre** (`265/70 R17` → Ø 0.80 m) and the bed length (pickups are sold by it).

## Research
Brochure / Certificate-of-Conformity values: length, width, height, wheelbase, tracks, ground
clearance, approach / departure / breakover angles, bed length × width between arches × depth,
tailgate height. Photos: side elevation (frame visible below the body), front, rear with tailgate
down, bed from above, underside (frame rails, axles, spare wheel), wheel close-up.

| Dimension | Crossover | Body-on-frame SUV | Full-size pickup (crew cab) | Mid-size pickup |
|---|---|---|---|---|
| length | 4.3–4.8 m | 4.8–5.3 | 5.8–6.4 | 5.3–5.6 |
| width (no mirrors) | 1.80–1.95 | 1.90–2.05 | 2.0–2.1 | 1.85–1.92 |
| height | 1.60–1.75 | 1.80–1.95 | 1.90–2.0 | 1.78–1.85 |
| wheelbase | 2.65–2.9 | 2.8–3.0 | 3.6–4.0 | 3.1–3.3 |
| tyre Ø | 0.70–0.76 | 0.76–0.82 | 0.80–0.86 | 0.76–0.80 |
| ground clearance | 0.17–0.21 | 0.21–0.27 | 0.22–0.27 | 0.22–0.29 |
| bed length (inside) | — | — | 1.7 / 2.0 / 2.5 m | 1.5 / 1.85 m |
| bed depth | — | — | 0.53–0.56 | 0.47–0.51 |
| tailgate top | — | — | 0.85–1.05 m | 0.8–0.9 |
| approach / departure | 17–22° / 20–25° | 30–40° / 25–35° | 20–26° / 22–27° | 29–33° / 22–25° |

## Part tree
```
frame (ladder: two rails + cross-members; static)          ← body-on-frame only
├── axle_f (independent: knuckles steer; solid: axle beam spins, steer_f_* sway Z)
├── axle_r (solid beam with diff pumpkin, leaf springs) → axle_r_wheel_l/_r
├── cab (static body shell) → doors door_fl…door_rr, bonnet, glass_*
├── bed (static box: floor, sides, front wall, arch tubs) → tailgate (sway Y, bottom hinge, 90°)
├── spare_wheel (under bed or on SUV tailgate), step_l/_r, tow_hitch (socket attach)
└── roof_rails, bull_bar (optional, original design)
```
Crossovers: no frame; `body` like a car, tailgate hinged at the roof.

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| wheels | spin | Y | |
| steer knuckles | sway | Z | ±30–35° |
| side doors | sway `oneWay` | Z at front hinge | 65–75° |
| pickup tailgate | sway `oneWay` | Y at bottom hinge | 90° down |
| SUV side-hinged rear door | sway `oneWay` | Z at right hinge | 90° |
| solid axle articulation | sway | X | ±8–12° (off-road pose) |

## Signature details
1. Big tyres in big square-ish arches; arch flares in black plastic.
2. Visible ladder frame and rear axle diff behind/under the bed (pickup).
3. Bed: stake pockets on top of sides, tie-down hooks, wheel-arch tubs inside, tailgate latches.
4. Gap between cab and bed (40–80 mm, body-on-frame) — declare it as a `gap`.
5. Tall flat bonnet, upright grille (original design), high beltline.
6. Side steps / running boards; tow hitch receiver (50 mm square).
7. Leaf springs and shocks visible behind the rear wheel.
8. Roof rails on SUVs; third brake light on cab roof.

## Materials
`steel_painted` body, `steel_painted` black frame and axles, `chrome` or `aluminium` trim and
rims, `rubber` tyres (chunky all-terrain tread at LOD0), `plastic` arches, bumpers, bed liner,
`glass` glazing, `iron_rust` on frame and exhaust for worn variants. Mud: `grime` with
`ground: 1` up to the sills and inside arches.

## LOD policy
- LOD0: frame, springs, diff, shocks, bed hardware, tread lugs, interior. 40–90k.
- LOD1: frame rails only, bed box with tubs, interior blocks. 8–18k.
- LOD2: cab + bed boxes, 4 wheels, dark glass. 600–1,500.

## QA
```ts
real: { length: 5.9, width: 2.03, height: 1.95, measures: [
  { label: 'wheelbase', axis: 'x', value: 3.7, between: ['axle_f', 'axle_r'] },
  { label: 'tyre diameter', axis: 'z', value: 0.80, parts: ['axle_r_wheel_l'], source: '265/70 R17' },
  { label: 'bed length', axis: 'x', value: 1.98, parts: ['bed_floor'] },
]},
checks: [touches('cab', 'frame'), touches('bed', 'frame'), clear('axle_*', 'bed', 0.03),
         symmetric('_l', '_r', 'y')],
gaps: [{ parts: ['cab', 'bed'], why: 'cab-to-bed gap on separate body mounts' }],
```

## Common mistakes
- Car-sized wheels on a truck body; or cab and bed fused into one box.
- Bed floor at frame-rail height with no arch tubs.
- Frame invisible from the side (it is the most "truck" detail at 3/4).
- No approach angle: bumpers hanging below the tyre tangent.
- Copied grille or badge — design an original face.

## Reuse
`wheel` (`spokes: 6`, `tread: true`), `axle`, `steel_beam` UPN for frame rails, `pipe` for exhaust,
`hex_bolt` body mounts, `hinge` (tailgate), `door_handle`. Planned: `leaf_spring`, `tow_hitch`.

## Sources
- Tyre code: https://en.wikipedia.org/wiki/Tire_code
- Off-road angles definitions: https://en.wikipedia.org/wiki/Approach_angle ·
  https://en.wikipedia.org/wiki/Departure_angle · https://en.wikipedia.org/wiki/Breakover_angle
- Pickup bed classes: https://en.wikipedia.org/wiki/Pickup_truck
