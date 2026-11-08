# Rail playbook (locomotives, wagons, coaches)

Steam, diesel and electric locomotives, freight wagons and passenger coaches. Historic named
subjects are ideal (public-domain photos, museum data). This repo's reference recipes:
[`loco_440`](../../../recipes/loco_440/README.md) (4-4-0 steam, Whyte family),
[`boxcar`](../../../recipes/boxcar/README.md) (USRA boxcar), and the station props
[`station_halt`](../../../recipes/station_halt/README.md),
[`signal_gantry`](../../../recipes/signal_gantry/README.md),
[`water_tower`](../../../recipes/water_tower/README.md). **Scale from the gauge and the
wheel**: standard gauge 1.435 m; driver and wagon wheel diameters are on every roster.

## Research
Rosters and diagrams (railway society diagram books, ORER for US freight cars, museum pages),
loading gauge (the outline the vehicle must fit), Whyte or UIC axle notation, wheel diameters,
length over buffers / couplers, bogie (truck) centres and wheelbase. Photos: side elevation both
sides (steam valve gear differs left/right only in phase), ends, roof, running gear close-ups,
coupler and buffer detail.

| Dimension | Typical | Notes / source |
|---|---|---|
| standard gauge | 1.435 m | between rail heads' inner faces |
| UK loading gauge (W6a) | ~2.82 m wide × 3.96 m high | smallest common European gauge |
| UIC GC / US Plate C | 3.15 × 4.65 m / 3.25 × 4.72 m | |
| freight wagon wheel | 0.84–0.92 m (US 33 in = 0.838) | |
| coach wheel | 0.84–0.92 m | |
| steam driver | 1.2–2.1 m (freight small, express big) | Whyte notation sets count |
| buffer centres (UIC) | 1.75 m apart, 1.06 m above rail | UIC 527 |
| coupler height (AAR) | 0.876 m (34½ in) | |
| bogie wheelbase (freight) | 1.65–1.8 m | |
| coach length | 20–26.4 m | UIC-X 26.4 m |
| 40 ft boxcar | 12.6 m body | see boxcar dossier |

## Part tree
```
frame / underframe (static) · body or boiler (static)
├── bogie_a, bogie_b (pivots; engines yaw them on curves)
│   └── axle_a_0 … (spin Y) → *_wheel_l/_r
├── steam: axle_lead_*, axle_driver_*, axle_trail_* ; rod_side_*, rod_main_*, crosshead_* (slide X)
├── door_* (sliding wagon doors: slide `oneWay` along X; coach doors: sway or plug)
├── coupler_a / coupler_b (sockets attach at ±X), buffer_* (slide −X, short stroke)
├── pantograph (electric: sway, `oneWay`) · cab_glass / headlamp (glass, glow)
└── emitters: stack_smoke, cylinder_steam_*, exhaust (diesel), sparks (brakes)
```

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| axles | spin | Y | rps = speed / (π × Ø); drivers slower than leading wheels |
| side rods, crossheads | slide | X | stroke = cylinder stroke (e.g. 24 in = 0.61 m) |
| bogies | engine-driven yaw | Z | ±5–8° |
| sliding doors | slide `oneWay` | ±X | door width |
| buffers | slide | X | 0.1 m |
| pantograph | sway `oneWay` | Y | to 1–2 m above roof |

## Signature details
1. Wheels with flanges inside the rail, tread taper; spokes or discs; brake shoes on the tread.
2. Buffers + screw coupling (Europe) or knuckle couplers (Americas) at the correct heights.
3. Steam: valve gear, rods, domes, sand pipes, handrails on stanchions, cab with roof overhang.
4. Wagons: outside framing or ribs, door tracks, ladders and grab irons, brake wheel/lever,
   lettering (capacity, reporting mark — invented or historic).
5. Bogie/truck side frames with springs and axle boxes.
6. Roof detail: vents, walkways (old freight), AC pods (coaches).
7. Track: rails on sleepers on ballast for presentation.

## Materials
`steel_painted` bodies (livery), `iron_cast` trucks and wheels, `iron_rust` hardware and couplers,
`wood_painted` / `wood_weathered` wooden wagons and running boards, `brass` / `copper` on steam
fittings, `aluminium` polished rods, `glass` windows, `rubber` gangway bellows, `stone` ballast,
`wood_weathered` sleepers. Grime: brake dust brown on bogies and lower body, soot on steam.

## LOD policy
- LOD0: rivets (`rivet_row`), valve gear, brake rigging, grab irons, lettering, track spikes.
  Locomotive 60–150k; wagon 20–50k.
- LOD1: running gear simplified, no rivets, lettering kept if large. 15–30k / 5–10k.
- LOD2: body box, wheels as discs, bogie blocks. ≤ 2,000 / ≤ 800.

## QA
```ts
real: { length: 13.34, width: 2.9, height: 4.04, measures: [
  { label: 'wheel diameter', axis: 'z', value: 0.838, parts: ['axle_a_0_wheel_l'] },
  { label: 'rail centres (1.435 gauge + 70 mm head)', axis: 'y', value: 1.505,
    between: ['rail_l', 'rail_r'], source: 'standard gauge; head width of the rail section' },
  { label: 'truck centres', axis: 'x', value: 9.37, between: ['truck_a', 'truck_b'] },
]},
checks: [clear('axle_*', 'body', 0.02), symmetric('_l', '_r', 'y')],
```
`between` compares part centres, so gauge (measured between inner rail-head faces) becomes rail
centres = gauge + one head width; state the convention in the dossier.

## Common mistakes
- Gauge eyeballed: wheels outside the rails or the body too narrow over them.
- Buffers/couplers at random heights so the wagons can't couple.
- Steam rods spinning (they slide/orbit); drivers and leading wheels at the same rps.
- Body width exceeding the loading gauge.

## Reuse
`axle`, `whyteAxles('4-6-2', …)`, `rivet_row`, `ladder`, `railing`, `hex_bolt`, `lamp`, `text`
for lettering, `steel_beam` for underframes; `ctx.use(wagon)` to make a train.

## Sources
- Track gauge: https://en.wikipedia.org/wiki/Standard-gauge_railway
- Loading gauge: https://en.wikipedia.org/wiki/Loading_gauge
- Whyte notation: https://en.wikipedia.org/wiki/Whyte_notation
- Buffers and chain coupler: https://en.wikipedia.org/wiki/Buffers_and_chain_coupler
- AAR coupler: https://en.wikipedia.org/wiki/Janney_coupler
