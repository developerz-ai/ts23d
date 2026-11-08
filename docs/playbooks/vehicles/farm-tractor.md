# Farm tractor playbook

Agricultural tractors: compact / utility (30–100 kW) and row-crop (100–250 kW), two-wheel or
mechanical front-wheel drive; vintage tractors (1920s–1960s, open seat, no cab) are a good public-
domain subject. Original livery — the big makers' colour schemes are trade dress. **Scale from the
rear tyre**: agricultural sizes are on the sidewall (`480/80 R38` → 38 in rim, Ø ≈ 1.73 m;
vintage `13.6-38` → Ø ≈ 1.6 m), and the rear wheel is the tractor's silhouette.

## Research
Maker spec sheet: length, width (min/max track), height to cab roof, wheelbase, ground clearance,
mass, tyre sizes front/rear, three-point hitch category (ISO 730), PTO speed (540 / 1000 rpm, ISO
500). Photos: side (rear wheel vs bonnet height), front (narrow front axle vs wide rear), rear
(hitch, PTO, drawbar), cab interior, front axle pivot, engine side panels.

| Dimension | Compact utility | Row-crop with cab | Vintage open tractor |
|---|---|---|---|
| length | 3.2–3.8 m | 4.5–5.5 | 2.8–3.4 |
| width | 1.6–2.0 | 2.3–2.6 | 1.6–1.9 |
| height (cab roof / exhaust) | 2.3–2.6 | 2.9–3.2 | 1.9–2.3 (exhaust top) |
| wheelbase | 1.9–2.3 | 2.6–3.0 | 1.8–2.1 |
| rear tyre Ø | 1.2–1.5 | 1.7–1.95 | 1.2–1.6 |
| front tyre Ø (MFWD) | 0.8–1.0 | 1.2–1.5 | 0.65–0.8 (2WD) |
| ground clearance | 0.35–0.45 | 0.45–0.55 | 0.3–0.4 |
| 3-point hitch category | 1 (lower-link pins Ø 22 mm) | 2–3 (Ø 28–37 mm) | 1 or drawbar only |
| PTO shaft | 1 3/8 in, 6 splines (540 rpm) | 1 3/8 in 21 splines (1000) | |

## Part tree
```
chassis (engine block, transmission, rear axle housing: the tractor IS its drivetrain)
├── bonnet, grille (original design), side_panels, exhaust_stack (emitter smoke), air_intake
├── front_axle (sway X ±10–12°: oscillates about a central pivot)
│   ├── steer_l / steer_r (sway Z ±50°) → wheel_f_l / _r (spin Y)
├── axle_r (spin Y) → axle_r_wheel_l / _r (big, with fenders over them)
├── cab (frame, glass_*, door_l sway Z, roof) or rops (rollover bar) + seat + wheel_steering
├── hitch: lift_arm_l/_r (sway Y), lower_link_l/_r (sway Y), top_link, drawbar
├── pto_shaft (spin X), pto_guard · front_weights (stack)
└── sockets: seat (driver), attach (hitch point, drawbar), attach (front loader)
```

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| rear / front wheels | spin | Y | front turns faster (smaller Ø); MFWD lead ratio ~1.3 |
| front axle oscillation | sway | X at centre pin | ±10–12° |
| steering knuckles | sway | Z | ±50–55° |
| lower links / lift arms | sway | Y at axle housing | 0–35° up |
| PTO shaft | spin | X | 540 rpm = 9 rps |
| cab door | sway `oneWay` | Z | 90° |

## Signature details
1. Huge rear tyres with chevron (bar) lugs pointing forward-up at the top of the tyre.
2. Narrow, tall bonnet over the engine; exhaust stack and air pre-cleaner rising in front of the cab.
3. Exposed drivetrain: engine block and gearbox are the frame (no chassis rails on most tractors).
4. Rear fenders over the wheels, with lamps on them.
5. Three-point hitch: two lower links, top link, lift arms with drop rods, stabiliser chains.
6. Front ballast weights in a stack on the front bracket.
7. Steps up the left side to the cab door; cab glass on 4 sides.
8. Wheel weights / cast centres on the rear rims; dished steel rims with bolts.

## Materials
`steel_painted` body in an original colour (vertex colour), `iron_cast` engine block, axle housings
and weights, `rubber` tyres (bar tread), `steel_painted` rims (often white, yellow or red),
`glass` cab, `chrome` or black exhaust, `leather` / `plastic` seat, `iron_rust` on vintage. Grime:
heavy — mud on tyres and lower body (`mud` strip on tread), dust on the bonnet, oil on the engine.

## LOD policy
- LOD0: lug rows on each tyre (place one lug N times), hitch links and chains, engine detail,
  cab interior, lamps. 30–70k.
- LOD1: tyres with 12–16 coarse lugs, hitch as links. 8–15k.
- LOD2: rear wheels, front wheels, bonnet box, cab box. 500–1,000.

## QA
```ts
real: { length: 4.8, width: 2.45, height: 3.0, measures: [
  { label: 'rear tyre diameter', axis: 'z', value: 1.73, parts: ['axle_r_wheel_l'], source: '480/80 R38' },
  { label: 'wheelbase', axis: 'x', value: 2.75, between: ['front_axle', 'axle_r'] },
]},
checks: [clear('axle_r_wheel_*', 'cab', 0.03), clear('wheel_f_*', 'chassis', 0.03),
         symmetric('_l', '_r', 'y')],
```

## Common mistakes
- Rear wheels too small (a tractor with car wheels is a quad bike).
- Lugs pointing the wrong way (the V's point leads in the rolling direction at ground contact).
- Front and rear wheels spinning at the same rps.
- A chassis frame under the engine (most tractors have none); bonnet too wide.
- Clean paint: tractors live in mud.

## Reuse
`wheel` (`spokes: 0`, `tread: true` with lugs; or build lugs with `place` around a custom tyre),
`axle`, `pipe` (hydraulics), `hex_bolt` (rim bolts), `ladder` / steps, `lamp`. Vintage: `iron_cast`
spoked rims built with `place` × spokes.

## Sources
- Agricultural tyre codes: https://en.wikipedia.org/wiki/Tire_code
- Three-point hitch categories (ISO 730): https://en.wikipedia.org/wiki/Three-point_hitch
- PTO (ISO 500): https://en.wikipedia.org/wiki/Power_take-off
- Tractor history and layouts: https://en.wikipedia.org/wiki/Tractor
