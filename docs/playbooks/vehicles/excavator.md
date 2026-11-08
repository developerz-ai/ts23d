# Excavator playbook (crawler / hydraulic)

Tracked hydraulic excavators: mini (1–6 t), midi (6–10 t), standard (13–30 t), large (30–90 t).
Wheeled excavators share the upper structure. Original livery — yellow is generic, maker colour
schemes and logos are not. **Scale from the track shoe width and the operating mass class**: spec
sheets are organised by mass, and the cab (a human box ~1 m wide) gives the eye its scale.

## Research
Maker spec sheet sections: dimensions (shipping length/height/width, track gauge, track length on
ground, tail swing radius, counterweight clearance, ground clearance, cab height), boom/arm
(stick) lengths, working ranges (max dig depth, reach, dump height), bucket capacity/width, shoe
width. Photos: side in transport pose (boom down, arm folded), front 3/4 working, top (offset cab,
engine hood), undercarriage close-up (rollers, idler, sprocket), hydraulic hoses along the boom.

| Dimension (20–22 t class, typical) | Range | Notes |
|---|---|---|
| shipping length | 9.4–9.7 m | boom 5.7 m + arm 2.9 m, folded |
| shipping height (boom) | 2.95–3.1 m | |
| cab height | 2.95–3.05 m | |
| overall width (track) | 2.8–3.2 m | 600–800 mm shoes |
| track gauge (centres) | 2.2–2.4 m | |
| track length on ground | 3.3–3.7 m | idler to sprocket centres |
| upper structure width | 2.7–2.8 m | |
| tail swing radius | 2.75–2.95 m | short-tail models ≈ 1.7 m |
| counterweight ground clearance | 1.0–1.1 m | |
| ground clearance (car body) | 0.44–0.47 m | |
| bucket capacity / width | 0.8–1.2 m³ / 1.0–1.3 m | |
| max dig depth / reach | 6.5–6.8 m / 9.8–10.0 m | |
| shoe pitch | 0.19 m, 3 grousers per shoe | |

For a mini excavator (≈ 1.7 t): length 3.6–3.9 m, width 0.99–1.3 m, height 2.3 m, dozer blade.

## Part tree
```
undercarriage (car body + track frames, static)
├── track_l / track_r (shoes; spin of a texture is not possible → animate sprocket/idler spin)
├── sprocket_l/_r, idler_l/_r, roller_l_0..7 / carrier_roller_* (spin Y)
├── blade (mini/midi: sway Y at frame, ±20°)
└── swing_ring
    └── upper (sway Z unlimited: slewing; pivot = slew ring centre)
        ├── cab (offset left: door_cab sway Z, glass_*), counterweight, engine_hood, handrail_*
        ├── boom (sway Y at boom foot pin, −20°…+55°) · boom_cyl_l/_r (barrel + rod: slide)
        │   └── arm (sway Y at boom tip pin, ~−35°…+120° relative)
        │       ├── arm_cyl (on boom top) · bucket_cyl (on arm)
        │       └── bucket_link → bucket (sway Y at arm tip pin, ~180° range)
        └── emitter exhaust (smoke)
```
Hydraulic cylinders: barrel part on one pin, rod part on the other, `clearOf` each other. With
only sway/slide motions, bake the cylinder as barrel + rod sliding along its own axis and keep the
clip short; a real IK pose is for the engine.

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| upper | spin (slew) or sway | Z | 360°, 9–12 rpm max |
| boom | sway | Y at foot pin | −20° to +55° |
| arm | sway | Y at boom tip | 35°–150° included angle |
| bucket | sway | Y at arm tip | ~170° total |
| cylinder rods | slide | own axis | stroke ≈ 0.5 × retracted length |
| sprocket, idler, rollers | spin | Y | |
| blade | sway | Y | ±20° |

## Signature details
1. Offset cab on the left, boom foot right of centre; engine hood and counterweight at the rear.
2. Rounded counterweight (tail swing arc in plan view).
3. Track frames with 7–9 bottom rollers, 1–2 carrier rollers, front idler, rear sprocket with teeth.
4. Triple-grouser shoes; track sag between carrier rollers.
5. Boom: box section, tapered, banana curve; twin boom cylinders under it.
6. Hydraulic hoses in pairs along the boom and arm, clamped every ~0.8 m.
7. Bucket with side cutters and 4–5 teeth; quick coupler between arm and bucket.
8. Cab: front glass to the floor, roll/FOPS guard, mirrors on stalks, handrails on the upper.

## Materials
`steel_painted` upper, boom, arm (original colour in vertex colour), `steel_painted` black/dark
grey for undercarriage, `iron_cast` sprocket and rollers, `iron_rust` / `steel_galvanised` worn
track shoes and bucket teeth (bright edges), `chrome` cylinder rods, `rubber` hoses and window
seals, `glass` cab, `plastic` interior. Grime: mud on tracks up to the frame, soil in the bucket,
oil around the slew ring, soot around the exhaust.

## LOD policy
- LOD0: every shoe and grouser (`place` along the track path), rollers, hoses with clamps,
  pins with retaining bolts, cab interior, handrails. 50–120k.
- LOD1: track as a lofted band with grouser ridges, hoses as single tubes. 10–25k.
- LOD2: track boxes, upper box, boom/arm/bucket as 3 prisms. 600–1,500.

## QA
```ts
real: { length: 9.5, width: 2.98, height: 3.0, measures: [
  { label: 'track gauge', axis: 'y', value: 2.39, between: ['track_l', 'track_r'] },
  { label: 'track length', axis: 'x', value: 3.65, parts: ['track_l'] },
  { label: 'shoe width', axis: 'y', value: 0.6, parts: ['track_l'] },
]},
checks: [clear('upper', 'track_*', 0.05), touches('upper', 'swing_ring'),
         clear('bucket', 'cab', 0.1), noOverlap('roller_l_*')],
gaps: [{ parts: ['upper', 'undercarriage'], why: 'slew ring running clearance' }],
```

## Common mistakes
- Boom pivots at the wrong pin, so the arm swings through the cab.
- Track flat with no sag, no rollers, no grousers; sprocket at the front.
- Cab centred; counterweight square.
- Cylinders that don't connect pin to pin, or rods longer than barrels.
- Toy proportion: bucket too big, boom too short.

## Reuse
`trackRun` kind builder (rollers + track runs), `pipe` (hoses, hose mode with sag), `railing`
(upper handrails), `hex_bolt`, `ladder` (step), `lamp` (bulkhead work lights). Tracked running
gear reference: [`recipes/tiger_1`](../../../recipes/tiger_1/README.md).

## Sources
- Excavator anatomy: https://en.wikipedia.org/wiki/Excavator
- Typical class figures: maker 20 t spec sheets (e.g. https://volvoce.com/europe/en/products/excavators/ec200e)
- Wheeled 20 t transport dims: https://www.lectura-specs.com/en/model/construction-machinery/wheel-excavators-caterpillar/m320-11749926
- ISO 6165 (earth-moving machinery types), ISO 7135 (hydraulic excavator terminology)
