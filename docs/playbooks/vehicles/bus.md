# Bus playbook

City buses (low-floor, 2–3 doors), coaches (high floor, luggage bays) and the North American
school bus (bonneted, body-on-chassis). Original liveries and designs only. **Scale from the
legal width and the floor**: 2.55 m wide (EU) / 2.59 m (US), low-floor entrance 320–340 mm above
the road; tyres `275/70 R22.5` (Ø ≈ 0.96 m).

## Research
Regulation: EU 96/53/EC (dimensions), UN ECE Regulation 107 (bus construction: door widths,
step heights, gangway). Manufacturer brochure drawings give length, wheelbase, overhangs, door
positions, floor height. Photos: side elevation (door and window rhythm), front, rear (engine
grille), interior along the gangway, door close-up, roof (AC pods, CNG tanks or batteries).

| Dimension | City bus 12 m | Articulated | Coach | School bus (type C) |
|---|---|---|---|---|
| length | 12.0 m | 18.0–18.75 | 12–15 | 10.5–12.2 |
| width | 2.55 | 2.55 | 2.55 | 2.44–2.59 |
| height | 2.9–3.3 (3.3+ with roof packs) | same | 3.5–3.9 | 3.0–3.2 |
| wheelbase | 5.8–6.0 | 5.6 + 6.0 | 6.0–7.0 (+tag axle) | 5.3–7.0 |
| front overhang | 2.6–2.8 | | 2.5–2.8 | (bonnet) |
| floor height at door | 0.32–0.34 (kneeling −0.07) | | 1.1–1.4 (steps) | 0.9 (3 steps) |
| door clear width | 1.2 m double · 0.65–0.8 single | | 0.8 | 0.6–0.75 |
| window sill above floor | 0.75–0.85 | | 0.65–0.75 | 0.6 |
| tyre Ø | 0.96 | | 1.0 | 0.95–1.0 |
| max length (EU) | 13.5 m rigid 2-axle, 15 m 3-axle, 18.75 m articulated | | | |

## Part tree
```
body (static shell; roof, skirts, bumpers separate if detailed)
├── axle_f (steer_f_l/_r sway Z ±50°) · axle_r (twin wheels, spin Y) · axle_tag (coach, steers)
├── door_0, door_1, door_2 (each leaf: door_<n>_l/_r; sway Z plug-door or slide outward + along)
├── glass_* (parent windows to body; door glass to its leaf) · destination_display (glow)
├── interior: seats (instanced), stanchions, floor, driver_seat, wheel_steering
├── mirror_l/_r (on arms at the front corners) · wiper_*
├── articulated: front_section, joint (sway Z ±45°, bellows part), rear_section
└── sockets: seat (driver + passengers), interact (doors), emitter exhaust
```

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| wheels | spin | Y | |
| steer | sway | Z | ±45–50° |
| inward-folding doors | sway `oneWay` | Z per leaf | 90° |
| plug doors | slide `oneWay` | out 0.05 m then along ±0.6 m (two clips or a group per stage) | |
| kneeling | slide `oneWay` | −Z on body | 0.06–0.08 m |
| articulation joint | sway | Z at turntable | ±40° |

## Signature details
1. Window rhythm: large panes with black pillars; continuous dark band along the side.
2. Low-floor: flat floor at kerb height, wheel arches intruding into the cabin.
3. Destination display above the windscreen (glow) and route number at the side door.
4. Mirror arms ("rabbit ears") curving out from the front corners.
5. Rear: engine grille, lamp clusters, often a tower of lamps; no rear window on many city buses.
6. Roof pods (AC, CNG tanks, batteries) with fairings.
7. Interior: yellow stanchions, grab handles, seats in pairs facing forward, priority area.
8. School bus: bonnet, black rub rails along the side, stop arm (sway on the left side), roof lamps.

## Materials
`steel_painted` or `plastic` body panels (livery in vertex colour), `glass` windows with dark tint,
`rubber` tyres, door seals and bellows (`canvas` dark for the articulation bellows), `aluminium`
rims and window frames, `steel_painted` yellow stanchions, `canvas` / `leather` seats. Grime:
road spray on the rear and lower sides, darker around the exhaust and wheel arches.

## LOD policy
- LOD0: interior seats and stanchions visible through glass, door leaves with glass, wipers,
  mirror arms, roof pods, wheel nuts. 30–70k (+interior).
- LOD1: interior = seat blocks, doors as panels. 8–15k.
- LOD2: body box with bevelled front, wheels, window band dark. ≤ 1,200.

## QA
```ts
real: { length: 12.0, width: 2.55, height: 3.1, measures: [
  { label: 'wheelbase', axis: 'x', value: 5.9, between: ['axle_f', 'axle_r'] },
  { label: 'floor height', axis: 'z', value: 0.33, parts: ['floor_entry'], source: 'brochure' },
  { label: 'tyre diameter', axis: 'z', value: 0.96, parts: ['axle_f_wheel_l'] },
]},
checks: [touches('seat_*', 'floor'), clear('axle_*', 'body', 0.02), noOverlap('seat_*')],
```

## Common mistakes
- Car-height windows and floor; door too narrow for two people.
- Interior empty or opaque windows — a bus is read through its glass.
- Wheels centred under the body ends (real buses have long front overhangs on city buses).
- One flat colour: no skirts, no black pillars, no lamps.

## Reuse
`wheel`, `axle`, `railing` (stanchions, tuned: Ø 35 mm), `hinge` (door leaves), `lamp`, `text`
primitive for route numbers. Planned: `seat` (bus pair), `mirror`, `light_cluster`.

## Sources
- UN ECE R107: https://unece.org/transport/vehicle-regulations-wp29/standards/addenda-1958-agreement-regulations-101-120
- EU dimensions 96/53/EC: https://www.legislation.gov.uk/eudr/1996/53/annex/I
- Low-floor bus: https://en.wikipedia.org/wiki/Low-floor_bus
- School bus: https://en.wikipedia.org/wiki/School_bus
