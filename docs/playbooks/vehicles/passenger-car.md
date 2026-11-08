# Passenger car playbook (sedan, hatchback, estate)

Monocoque road cars, segments A–E (city car to executive). Original designs in the class: learn the
proportions from real cars, never their grille, lamp graphics or badges. **Scale from the wheel**:
tyre size is printed on the sidewall (`205/55 R16` = 205 mm wide, 55 % profile, 16 in rim →
Ø = 16 × 25.4 + 2 × 0.55 × 205 = 632 mm) and every viewer judges a car by it.

## Research
Manufacturer brochures and type-approval data (EU Certificate of Conformity lists length, width
without mirrors, height, wheelbase, track front/rear, tyre sizes). Third-party dimension sites
publish side/front/top drawings with these values. Photos: pure side elevation (for the profile
`prism` / `loft` sections), front, rear, top, 3/4 front and rear, wheel close-up, door shut-lines,
interior from the driver's door.

| Dimension | A/B hatch | C hatch/sedan | D/E sedan, estate |
|---|---|---|---|
| length | 3.6–4.1 m | 4.25–4.65 m | 4.7–5.1 m |
| width (no mirrors) | 1.62–1.75 | 1.78–1.85 | 1.82–1.95 |
| width with mirrors | +0.15–0.25 | | |
| height | 1.45–1.55 | 1.42–1.50 | 1.42–1.50 (estate +0.03) |
| wheelbase | 2.35–2.6 | 2.6–2.75 | 2.8–3.0 |
| track | 1.40–1.52 | 1.53–1.60 | 1.58–1.65 |
| tyre Ø | 0.58–0.62 | 0.62–0.66 | 0.66–0.72 |
| ground clearance | 0.13–0.16 | 0.13–0.15 | 0.12–0.15 |
| door handle height | 0.95–1.05 | | |
| window line (beltline) | 0.90–1.00 | | |

Ratios that hold: wheelbase ≈ 0.58–0.62 × length; front overhang < rear overhang on sedans;
glasshouse ≈ 1/3 of side height; roof ≈ 55–60 % of length on a sedan.

## Part tree
```
body (static shell: panels, roof, glass separate)
├── axle_f (spin Y) → axle_f_wheel_l / _r ; parent: steer_f_l / steer_f_r (sway Z, ±35°)
├── axle_r (spin Y) → axle_r_wheel_l / _r
├── door_fl, door_fr, door_rl, door_rr (pivot at front hinge line, sway Z)
├── bonnet (pivot at rear hinge, sway Y), boot / tailgate (pivot at top hinge, sway Y)
├── glass_windscreen, glass_side_*, glass_rear (surface: 'glass'; door glass parents to its door)
├── wheel_steering (spin about column), seat_fl … (static)
├── lamp_head_l/_r, lamp_tail_l/_r (glow), mirror_l/_r (fold: sway Z)
└── sockets: seat (driver), attach (tow), light (headlamps)
```
Brake discs/calipers: discs on the wheel (spin), calipers on the knuckle (static) — not on the axle.

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| wheels / axles | spin | Y | rps from speed / circumference |
| front knuckles | sway | Z | ±30–40° (inner wheel lock) |
| side doors | sway, `oneWay` | Z at hinge | 65–75° open |
| bonnet | sway, `oneWay` | Y at rear hinge | 45–60° |
| boot lid / tailgate | sway, `oneWay` | Y at top hinge | 70–90° |
| mirrors | sway | Z | 70° fold |

## Signature details
1. Wheel arches with a 25–60 mm gap above the tyre; tyres fill the arch, rims to the outer face.
2. Shut-lines 3–5 mm wide around doors, bonnet, boot, fuel flap.
3. Glasshouse tumblehome: side glass leans in 10–20° at the top.
4. Body side not flat: shoulder line, crease, curved sill; the plan view is barrel-shaped.
5. Lamp clusters set into the body with lens over a chrome/black reflector.
6. Black plastic: mirrors, sills, lower grille, wiper arms, door seals.
7. Windscreen raked 55–65° from vertical; A-pillar thin.
8. Visible interior through glass: seats, dashboard, steering wheel.
9. Number-plate recess (520 × 110 mm EU, 12 × 6 in US) — blank or invented plate.
10. Exhaust tip, tow eye cover, washer jets, aerial.

## Materials
`steel_painted` body (vertex colour; metallic paints still dielectric film over the strip),
`glass` surface on all glazing with dark tint, `chrome` or `aluminium` trim and rims, `rubber`
tyres, seals, wiper blades, `plastic` black trim and dash, `leather` / `canvas` seats, `iron_cast`
brake discs. Wear: dust on sills and lower doors, brake dust on rims, darker arches.

## LOD policy
- LOD0: lofted body (sections every 0.2–0.3 m), panel gaps as grooves, interior, tyre tread,
  brake parts, wipers, lamps with inner reflectors. 30–80k tris.
- LOD1: body sections halved, interior = seats + dash block, wheels 16 segments. 6–15k.
- LOD2: body loft at 6–8 sections, 4 wheels as 8-sided cylinders, glass as dark body faces. 500–1,200.

## QA
```ts
real: { length: 4.45, width: 1.80, height: 1.46, measures: [
  { label: 'wheelbase', axis: 'x', value: 2.68, between: ['axle_f', 'axle_r'] },
  { label: 'front track', axis: 'y', value: 1.55, between: ['axle_f_wheel_l', 'axle_f_wheel_r'] },
  { label: 'tyre diameter', axis: 'z', value: 0.632, parts: ['axle_f_wheel_l'], source: '205/55 R16' },
]},
checks: [clear('axle_*', 'body', 0.02), symmetric('_l', '_r', 'y'), touches('door_*', 'body')],
gaps: [{ parts: ['door_*', 'body'], why: '4 mm panel shut-line' }],
```
Width in `real` excludes mirrors only if your model has none; otherwise use the with-mirror value.

## Common mistakes
- Wheels too small (≤ 0.55 m on a modern car) or sunk into the arches; tyres too narrow.
- Box body: no tumblehome, no plan-view curvature, vertical windscreen.
- Glass opaque single colour with no interior behind it.
- No panel gaps, or gaps as see-through slits.
- Wheel spin axis on X (rolling sideways), or front wheels that steer about the wrong point.
- Brand grille / badge copied: design an original face.

## Reuse
`wheel` (`spokes: 5` alloys, `tread: true`), `axle` kind builder, `door_handle` (flush pull),
`hinge` hidden. Body: `loft` with `ringXY` sections from the drawing, or `visualHull` from
side/top/front SVGs then `sculpt`. Planned: `seat`, `mirror`, `light_cluster`, `number_plate`.

## Sources
- Tyre code arithmetic: ISO 4000-1 / ETRTO; https://en.wikipedia.org/wiki/Tire_code
- Euro car segments: https://en.wikipedia.org/wiki/Euro_car_segment
- EU plate size 520 × 110 mm: https://en.wikipedia.org/wiki/Vehicle_registration_plates_of_Europe
- Model reference: [`recipes/roadster_v10`](../../../recipes/roadster_v10/README.md)
