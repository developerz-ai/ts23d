# Motorcycle playbook

Standard / naked, sport, cruiser, adventure, scooter, and vintage singles (public-domain era
designs are good subjects). Original tank shapes, liveries and badges only. **Scale from the
wheels and the seat height**: motorcycle tyres are sized like `120/70 ZR17` front and
`180/55 ZR17` rear (Ø ≈ 0.60 / 0.63 m); seat height is on every spec sheet and is human-scaled.

## Research
Spec sheet: length, width (bars), height (mirrors / screen), wheelbase, seat height, ground
clearance, rake and trail, tyre sizes, wet mass, fork travel, shock travel. Photos: side elevation
both sides (exhaust side differs), front (bar width, headlamp, fork legs), rear (tail, plate
hanger), top (tank shape), engine close-up (cylinders, cases, cooling fins or radiator).

| Dimension | Naked / sport | Cruiser | Adventure | Scooter (125) |
|---|---|---|---|---|
| length | 2.05–2.15 m | 2.3–2.5 | 2.2–2.35 | 1.85–2.0 |
| width (bars) | 0.72–0.82 | 0.85–0.95 | 0.9–1.0 | 0.7–0.75 |
| height | 1.05–1.2 | 1.1–1.2 | 1.4–1.55 (screen) | 1.15–1.3 |
| wheelbase | 1.40–1.47 | 1.6–1.7 | 1.5–1.6 | 1.3–1.4 |
| seat height | 0.79–0.84 | 0.66–0.72 | 0.85–0.90 | 0.76–0.80 |
| rake / trail | 23–25° / 95–105 mm | 30–34° / 120–150 | 25–27° / 105–120 | 26–28° / 85–95 |
| front / rear tyre Ø | 0.60 / 0.63 | 0.64–0.68 / 0.64–0.68 | 0.70 (21 in) / 0.65 (18 in) | 0.48–0.55 |
| ground clearance | 0.13–0.15 | 0.12–0.14 | 0.2–0.25 | 0.12–0.14 |
| fork tube Ø | 41–43 mm (USD 43–48) | 41–49 | 43–48 | 30–33 |

## Part tree
```
frame (static: frame tubes / spars, subframe, engine mounts) · engine (static: cylinders, cases, cover)
├── steer (pivot on the steering-head axis; sway ±30–35°)
│   ├── fork_l/_r (upper tube) → fork_slider_l/_r (slide along fork axis: suspension)
│   ├── triple_clamp_top/_bottom, handlebar, headlamp, instruments, mirror_l/_r, lever_*
│   └── wheel_f (spin Y) · brake_disc_f_l/_r · caliper_f_* (on the sliders)
├── swingarm (sway Y at the swingarm pivot behind the gearbox, ±8°)
│   └── wheel_r (spin Y) · sprocket_r · brake_disc_r · chain (static loop)
├── shock_r (slide along its axis), tank, seat, side_panels, exhaust (pipe + silencer)
├── side_stand (sway Y `oneWay`, ~100°) · footpeg_* · kick_start (vintage)
└── sockets: seat (rider, pillion), emitter exhaust
```

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| wheels | spin | Y | |
| steering | sway | steering-head axis (tilted by the rake) | ±30–35° |
| fork sliders | slide | fork axis | 0.12–0.15 m travel (adventure 0.2) |
| swingarm | sway | Y at pivot | ±6–10° |
| side stand | sway `oneWay` | Y at its foot pivot | 90–110° |
| front brake lever, clutch lever | sway | Z | 20° |

## Signature details
1. The engine is the centrepiece: cylinder fins or radiator, crankcase covers, visible bolts.
2. Exhaust headers curving from the cylinder head, collector, silencer — on one side or both.
3. Fork with stanchions (chrome/gold) sliding into sliders; triple clamps; big front discs.
4. Swingarm with chain adjusters and a monoshock or twin shocks.
5. Tank shaped for the knees (narrower at the rear); seat stepped on sport bikes.
6. Bars, levers, mirrors on stalks, switch gear, cables to the throttle.
7. Lean stance on the side stand: the bike leans 6–10° left.
8. Chain and sprockets visible; front sprocket cover on the left.

## Materials
`steel_painted` tank and bodywork (or `plastic` for fairings), `aluminium` cases, frame spars,
swingarm, wheels, `chrome` exhaust headers, fork stanchions and cruiser trim, `iron_cast` discs,
`rubber` tyres and grips, `leather` seat, `glass` lamps and screen (`translucent` tinted screen).
Grime: road dirt on the lower engine and swingarm, heat discolouration on headers (gold/blue band
via vertex colour gradient), chain lube spatter on the rear rim.

## LOD policy
- LOD0: fins (place N), bolts on cases, cables, chain links, spokes (wire wheels), brake discs
  with holes, instrument faces. 25–60k.
- LOD1: engine as blocks with fin slabs, wheels 20 segments, no cables. 5–10k.
- LOD2: silhouette: 2 wheels, engine block, tank+seat, fork. 300–700.

## QA
```ts
real: { length: 2.1, width: 0.8, height: 1.12, measures: [
  { label: 'wheelbase', axis: 'x', value: 1.44, between: ['wheel_f', 'wheel_r'] },
  { label: 'seat height', axis: 'z', value: 0.82, parts: ['seat'], source: 'spec sheet (top of seat)' },
  { label: 'rear tyre diameter', axis: 'z', value: 0.63, parts: ['wheel_r'] },
]},
checks: [clear('wheel_f', 'frame', 0.02), clear('wheel_r', 'swingarm', 0.01), touches('engine', 'frame')],
```
(`seat height` as a parts extent measures the seat's own height; prefer a custom check comparing the
seat top z to the value, or measure `between` the ground contact and a `seat_top` socket.)

## Common mistakes
- Steering axis vertical; fork straight up — rake is the most important angle on the bike.
- Engine as a featureless box; no exhaust headers.
- Wheels same size front and rear on an adventure bike (21/18) or cruiser (front often bigger).
- Bike standing perfectly upright on its side stand.
- Copying a famous tank badge or fairing graphic.

## Reuse
`wheel` (cast: `spokes: 5`; wire wheels: build with `beam` spokes like the bicycle playbook),
`pipe` (headers with fillets, hoses), `hex_bolt` M6–M8, `lamp`. [Bicycle playbook](bicycle.md)
for chain and spoke lacing.

## Sources
- Geometry (rake, trail): https://en.wikipedia.org/wiki/Bicycle_and_motorcycle_geometry
- Tyre code: https://en.wikipedia.org/wiki/Tire_code
- Types of motorcycles: https://en.wikipedia.org/wiki/Types_of_motorcycles
