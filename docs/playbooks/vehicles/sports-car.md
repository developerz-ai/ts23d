# Sports car playbook

Front-engined GT / roadster and mid-engined coupé. Original designs in the class only — sports cars
are the most trademarked shapes on the road; learn proportion, not styling. Worked example in this
repo: [`recipes/roadster_v10`](../../../recipes/roadster_v10/README.md). Read
[passenger car](passenger-car.md) for tyres, doors and glazing. **Scale from the wheels**: wide,
low-profile, often staggered (`245/35 R20` front, `305/30 R20` rear → Ø 0.68 / 0.69 m).

## Research
Manufacturer data (length, width, height, wheelbase, tracks, tyre sizes front/rear, weight
distribution), side elevation photos at 0° (lens distortion ruins proportions — use long-lens or
drawing sites), top view (cab-forward vs cab-back reads from above), rear 3/4, engine bay / engine
cover, diffuser and underside, cockpit.

| Dimension | Front-engined GT / roadster | Mid-engined coupé |
|---|---|---|
| length | 4.0–4.7 m | 4.3–4.7 |
| width (no mirrors) | 1.75–1.95 | 1.90–2.05 |
| height | 1.15–1.30 (roadster top down ≈ windscreen top) | 1.10–1.22 |
| wheelbase | 2.3–2.7 | 2.45–2.7 |
| tyre Ø | 0.64–0.70 | 0.66–0.71 |
| ground clearance | 0.10–0.13 | 0.09–0.12 |
| bonnet length (front axle → windscreen base) | 1.2–1.6 | 0.4–0.7 |
| seat H-point above ground | 0.30–0.40 | 0.28–0.35 |

Proportion rules: front-engined = long bonnet, cabin pushed back, short rear deck; mid-engined =
cab-forward, cabin centre ahead of the wheelbase centre, engine cover behind the seats. Height ≈
1/3.5–1/4 of length. Rear track ≥ front track.

## Part tree
```
body (static) · glass_windscreen · glass_side_l/_r (parent door) · rollbar (roadster)
├── axle_f → wheels, steer_f_l/_r (sway Z); axle_r → wheels (wider, staggered)
├── door_l, door_r (sway Z at front hinge; or scissor: sway Y at the A-pillar foot)
├── bonnet (front engine: sway Y rear hinge) / engine_cover (mid: sway Y front hinge)
├── spoiler (optional, slide +Z when active), diffuser (static)
├── lamp_*, exhaust_tip_* (emitter smoke when moving), brake_caliper_* on knuckles
└── soft_top (roadster: static stowed or raised as separate variant)
```

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| wheels | spin | Y | |
| steering | sway | Z | ±30° |
| conventional door | sway `oneWay` | Z | 60–70° |
| scissor door | sway `oneWay` | Y at A-pillar | 80–90° up |
| active spoiler | slide `oneWay` | +Z | 0.05–0.12 m |
| engine cover | sway `oneWay` | Y | 45–60° |

## Signature details
1. Low, wide stance: tyres flush with the arch lips, minimal arch gap (15–30 mm).
2. Big wheels with large brake discs and coloured calipers visible through spokes.
3. Strongly raked windscreen (60–70° from vertical), low roof, narrow side glass.
4. Side intakes ahead of rear wheels (mid-engine) or bonnet vents (front-engine).
5. Rear: diffuser fins, twin or quad exhaust tips, slim lamp strip.
6. Visible cabin: bucket seats, roll hoops, small steering wheel.
7. Splitter lip and canards close to the ground.
8. Plan view: pronounced rear haunches, wider than the cabin.

## Materials
`steel_painted` body (bold paint; vertex colour), `plastic` black for diffuser, splitter, intakes
(or a custom carbon-weave material via `defineMaterial`), `chrome` exhaust tips, `aluminium` rims,
`rubber` tyres, `leather` seats, `glass` glazing, `iron_cast` discs. Grime: light — road dust on
the lower rear and inside the diffuser, brake dust on the rims.

## LOD policy
- LOD0: lofted body ≥ 30 sections, cockpit, brake discs + calipers, vents as `cutout` grilles,
  diffuser fins. 40–100k.
- LOD1: 15 sections, seats + dash, wheels 20 segments. 8–20k.
- LOD2: 8 sections, wheels 8 segments, glass as dark faces. 800–1,500.

## QA
```ts
real: { length: 4.45, width: 1.96, height: 1.18, measures: [
  { label: 'wheelbase', axis: 'x', value: 2.62, between: ['axle_f', 'axle_r'] },
  { label: 'rear tyre diameter', axis: 'z', value: 0.69, parts: ['axle_r_wheel_l'] },
  { label: 'rear track', axis: 'y', value: 1.67, between: ['axle_r_wheel_l', 'axle_r_wheel_r'] },
]},
checks: [clear('axle_*', 'body', 0.015), symmetric('_l', '_r', 'y')],
```

## Common mistakes
- Saloon proportions squashed flat — wheelbase too short, overhangs too long.
- Tyres too small and narrow; same width front and rear.
- Arch gaps of a family car (60 mm); ride height too high.
- Copying a famous silhouette: change the graphic (lamp shapes, intake shapes, glass outline).

## Reuse
`wheel` (`spokes: 10`, low profile: `rim` close to `diameter`), `axle`, `pipe` (exhaust), `loft` +
`ringXY` for the body or `visualHull` from three SVG views. Planned: `seat` (bucket), `mirror`.

## Sources
- Tyre code: https://en.wikipedia.org/wiki/Tire_code
- Mid-engine layout: https://en.wikipedia.org/wiki/Mid-engine_design
- Cab-forward vs long-bonnet proportion: https://en.wikipedia.org/wiki/Front-engine,_rear-wheel-drive_layout
