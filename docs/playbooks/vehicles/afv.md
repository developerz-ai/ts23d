# Armoured fighting vehicle playbook (historic)

Tanks, tank destroyers, tracked and wheeled armoured cars — historic subjects (WWI–Cold War) with
museum and archive references. Modern in-service vehicles: original designs in the class only.
This repo's references: [`tiger_1`](../../../recipes/tiger_1/README.md) (plate angles, Zimmerit,
interleaved wheels) and [`t34`](../../../recipes/t34/README.md) (family with turret variants).
**Scale from the road wheel diameter and wheel station pitch**: both are in the standard
references and the eye counts wheels.

## Research
Dimension tables (hull length, length with gun, width over tracks/skirts, height, ground
clearance), armour tables (thickness and angle from vertical per plate), running gear (wheel
diameter, number of stations, pitch, track width, track pitch, sprocket teeth), turret ring
diameter, gun calibre × barrel length in calibres. Museum walkarounds (Tank Museum Bovington,
Kubinka, Aberdeen, Saumur), archive photos per production batch — features changed month by month,
so pick one variant and date it.

| Dimension | WW2 medium | WW2 heavy | Cold War MBT (typical) |
|---|---|---|---|
| hull length | 5.9–6.7 m | 6.3–7.4 | 6.4–7.7 |
| width | 2.7–3.0 | 3.4–3.75 | 3.3–3.7 |
| height | 2.4–2.8 | 2.7–3.1 | 2.2–3.0 |
| road wheel Ø | 0.5–0.85 | 0.7–0.8 | 0.6–0.8 |
| track width | 0.4–0.55 | 0.6–0.8 | 0.58–0.66 |
| ground clearance | 0.4–0.45 | 0.45–0.5 | 0.43–0.5 |
| turret ring Ø | 1.4–1.8 | 1.8–2.1 | 2.1–2.4 |
| barrel length | calibre × L/xx (e.g. 88 mm × 56 = 4.93 m) | | |

## Part tree
```
hull (static: plates as prisms at their sourced angles) · fenders · stowage_*
├── track_l / track_r (top, bottom runs or full loop) · sprocket_l/_r · idler_l/_r
├── wheel_l_0 … / wheel_r_0 … (spin Y) · return_roller_* · suspension arms (static or sway Y)
├── turret (sway Z: traverse; pivot = turret ring centre)
│   ├── mantlet → gun (sway Y: elevation; pivot = trunnion) → barrel, muzzle_brake, emitter muzzle
│   ├── cupola (sway Z), hatch_* (sway `oneWay`), periscope_*, mg_coax
├── hatch_driver, hatch_radio (sway `oneWay`) · mg_bow (ball mount)
└── emitters: exhaust_smoke_l/_r (moving), track_dust_l/_r (moving), muzzle (event)
```

## Motion
| Part | Motion | Axis | Limits |
|---|---|---|---|
| turret | sway (or spin) | Z | 360° traverse; bake ±20–30° scan |
| gun | sway | Y at trunnion | −5…−10° depression, +15…+20° elevation |
| road wheels, sprockets, idlers | spin | Y | sprocket rps = track speed / (teeth × pitch) |
| hatches | sway `oneWay` | hinge | 90–110° |
| track_l / track_r | tread | belt plane | `motion: tread(beltLine, y, linkPitch)` (× 2 pitch for alternating links); the `treads` gate fails a belt without it |
| suspension arms | sway | Y | ±10° |

## Signature details
1. Plate angles exactly as sourced; weld seams and plate thickness visible at edges.
2. Track with individual links (LOD0), guide horns, correct sag between return rollers.
3. Interleaved or paired road wheels at the sourced pitch; rubber tyres on wheels.
4. Turret: cast texture (rough, rounded) vs welded (crisp edges); lifting hooks; vision blocks.
5. Tools on the hull (shovel, axe, tow cable, jack), spare track links, stowage bins.
6. Exhausts with guards, engine deck grilles, fuel caps.
7. Era-correct markings (national insignia, turret numbers) from photos of that unit.
8. Mud and dust graded from the tracks up; soot on exhausts; chipped paint at edges.

## Materials
`steel_painted` hull and turret (camouflage via vertex colour patches seeded from `ctx.rng`),
`iron_cast` cast turrets and mantlets, `iron_rust` track links, tools and exhausts, `rubber` wheel
tyres, `wood_weathered` tool handles and jack blocks, `glass` vision blocks, `canvas` tarps and
mantlet covers. Grime: `grime(mesh, { ground: 1.3 })`, exhaust soot zones.

## LOD policy
- LOD0: every track link (place along the path), bolts, weld beads, tools, Zimmerit / casting
  texture as geometry where the budget allows. 40–150k.
- LOD1: track as a lofted band with link ridges, no tools. 10–25k.
- LOD2: hull, turret, gun, track boxes, wheels as discs. 800–1,500.

## QA
```ts
real: { length: 8.45, width: 3.56, height: 3.0, measures: [
  { label: 'road wheel diameter', axis: 'z', value: 0.8, parts: ['wheel_l_0'] },
  { label: 'wheel station pitch', axis: 'x', value: 0.515, between: ['wheel_l_0', 'wheel_l_1'] },
  { label: 'barrel length', axis: 'x', value: 4.928, parts: ['gun_barrel'] },
]},
checks: [clear('track_*', 'hull_*', 0.02), noOverlap('wheel_l_*'), touches('turret_body', 'hull_top'),
         symmetric('_l', '_r', 'y')],
```

## Common mistakes
- Mixing features from different production batches (the dossier must pick one).
- Plates all vertical or all at 45°; no overhangs or panniers where they existed.
- Track floating above the wheels, or sinking into the hull.
- Gun pivot at the barrel centre instead of the trunnion.
- Uniform green: no chipping, mud gradient, or camouflage pattern.

## Reuse
`trackRun`, `axle`, `rivet_row`, `hex_bolt`, `text` (turret numbers), `pipe` (exhausts),
`extrudeSvg` (insignia stencils), `defineFamily` for variants (see `t34`).

## Sources
- The Tank Museum, Bovington: https://tankmuseum.org/
- Bundesarchiv images on Wikimedia Commons: https://commons.wikimedia.org/wiki/Category:Images_from_the_German_Federal_Archive
- Armour-angle and running-gear sources used in practice: see the tiger_1 dossier.
