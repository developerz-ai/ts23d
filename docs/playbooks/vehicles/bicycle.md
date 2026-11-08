# Bicycle playbook

Diamond-frame road and gravel bikes, city/step-through bikes, hardtail and full-suspension
mountain bikes, BMX. The thinnest asset class you will build: tubes are 25–45 mm, spokes 2 mm, so
LOD policy is everything. **Scale from the rim**: ISO 5775 bead seat diameter (BSD) — 622 mm
(700C / 29er), 584 mm (650B / 27.5), 559 mm (26 in), 406 mm (20 in BMX) — plus tyre width ×2.

## Research
Maker geometry chart for one frame size: stack, reach, head angle, seat angle, top tube
(effective), chainstay length, wheelbase, BB drop / BB height, fork offset, head tube length,
standover. Photos: pure side elevation (drive side), front, top (handlebar width), drivetrain
close-up, cockpit, brake (rim vs disc).

| Dimension (medium frame, typical, verify) | Road / gravel | City | Hardtail MTB |
|---|---|---|---|
| wheel BSD / tyre | 622 / 25–45 mm | 622 or 584 / 35–50 | 622 or 584 / 55–65 |
| tyre outer Ø | 0.67–0.71 m | 0.68–0.72 | 0.72–0.76 |
| wheelbase | 0.98–1.06 m | 1.05–1.15 | 1.12–1.22 |
| chainstay | 0.405–0.43 | 0.44–0.47 | 0.425–0.44 |
| BB height | 0.265–0.275 | 0.28–0.30 | 0.30–0.32 |
| head angle / seat angle | 71–73.5° / 73–74.5° | 68–70 / 70–72 | 64–67 / 74–76 |
| handlebar width | 0.40–0.46 (drop) | 0.56–0.62 | 0.76–0.80 |
| saddle height (BB → top) | 0.70–0.78 | 0.75–0.85 | 0.70–0.78 |
| tube Ø (steel / alu / carbon) | 25–32 / 32–45 / aero | 28–40 | 35–50 |
| crank length | 0.170–0.175 | 0.170 | 0.170–0.175 |
| spokes per wheel | 20–32 | 32–36 | 28–32 |

Build the frame from points: BB at origin-height, rear axle (−chainstay horizontal), head tube
top from stack/reach, seat tube along the seat angle — never eyeball tube ends.

## Part tree
```
frame (static: tubes swept between joint points, dropouts, bottle bosses)
├── fork_steer (pivot on the head-tube axis, sway about that tilted axis ±60°)
│   ├── fork, stem, handlebar, brake_lever_l/_r, grips
│   └── wheel_f (spin Y) → hub, spokes, rim, tyre ; brake_disc_f
├── wheel_r (spin Y) → cassette (spins with wheel), brake_disc_r
├── crank (spin Y at BB) → crank_l, crank_r, chainring ; pedal_l/_r (spin Y, counter-rotate to stay level)
├── chain (static loop or `cutout` strip), derailleur_r, seatpost → saddle
└── sockets: seat (rider H-point at saddle), attach (bottle cages)
```
A tilted steering axis: author the fork in a group whose local Z is the head-tube axis
(`ctx.group('fork_steer', { at, yaw })` plus a pitched child), then sway about local Z.

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| wheels | spin | Y | 1 rev = π × tyre Ø |
| crank | spin | Y | gear ratio: wheel rps = crank rps × chainring / cog |
| pedals | spin | Y, opposite to crank | keeps pedals level |
| steering | sway | head-tube axis | ±45° (bars hit the top tube at ~60°) |
| rear shock (full-sus) | slide | shock axis | 30–65 mm stroke |

## Signature details
1. True spoke lacing: spokes leave the hub flanges tangentially (3-cross), not radial lines from the centre.
2. Head tube tilted ~72°; fork rake bends forward at the dropouts.
3. Chainring and cassette teeth, chain wrapping both; derailleur hanging below the cassette.
4. Cables / hoses running along the frame to brakes and derailleurs.
5. Valve stem on the rim, tyre tread / file pattern, tyre sidewall tan or black.
6. Saddle rails and clamp; seatpost entering the seat tube with a clamp.
7. Thin everything: tubes, spokes and cables are the read.

## Materials
`steel_painted` or `aluminium` frame (paint colour in vertex colour), `aluminium` rims, cranks,
stem, bars, `chrome` spokes and chain (or `steel_galvanised`), `rubber` tyres and grips,
`leather` saddle (city/vintage) or `plastic`, `plastic` cable housings. Spokes at LOD0 can use the
`cutout` surface on a disc card if the triangle budget is tight.

## LOD policy
- LOD0: every spoke as a 4–6-sided beam (`beam`), chain links (place one link N times), cassette
  cogs, cables (`sweep`), tread. 20–50k.
- LOD1: spokes as a `cutout` disc card or 8 beams, chain as a strip, no cables. 3–6k.
- LOD2: frame tubes 4-sided, wheels as rim + tyre 12 segments, no spokes. 300–600.
Tubes under ~1 cm in diameter are invisible past 10 m; drop them at LOD1.

## QA
```ts
real: { length: 1.75, width: 0.44, height: 1.05, measures: [
  { label: 'wheelbase', axis: 'x', value: 1.0, between: ['wheel_f', 'wheel_r'] },
  { label: 'tyre diameter', axis: 'z', value: 0.672, parts: ['wheel_r'], source: '622-25 tyre' },
  { label: 'BB height', axis: 'z', value: 0.27, parts: ['crank_axle'] },
]},
checks: [clear('wheel_f', 'frame', 0.01), clear('crank_*', 'frame', 0.005), touches('saddle', 'seatpost')],
```

## Common mistakes
- Wheels too small (≤ 0.6 m) or tyres too fat for the type; radial spokes on a rear wheel.
- Frame drawn by eye: head tube vertical, BB at axle height.
- Pedals rotating with the crank arms (they stay level).
- Chain missing, or floating between rings.
- Everything 4 cm thick to "read" — a fat bike is a toy bike.

## Reuse
`wheel` is car-shaped; build bicycle wheels with `lathe` (rim profile) + `beam` spokes (laced),
`sweep` for tubes with mitred joints, `pipe` (hose mode) for cables, `hex_bolt` M5 for bosses.
Planned: `bike_wheel`, `chain`.

## Sources
- ISO 5775 tyre/rim designations: https://en.wikipedia.org/wiki/ISO_5775
- Geometry terms (stack, reach, trail): https://en.wikipedia.org/wiki/Bicycle_and_motorcycle_geometry
- Spoke lacing: https://en.wikipedia.org/wiki/Bicycle_wheel
- Example geometry tables: https://bikeinsights.com/ · https://www.geometrygeeks.bike/
- ISO 4210 (bicycle safety requirements, not geometry)
