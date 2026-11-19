# T-34/76 — Model 1943 (`t34`) and Model 1941 (`t34_1941`), one family in `recipes/t34/t34.ts`

## Identity
`t34`: Model 1943 with the hexagonal "nut" turret, commander's cupola and external side fuel drums,
marked «LIDICE» as on the 1st Czechoslovak Independent Brigade's tank (photo below).
`t34_1941`: the cast turret with the single big forward-hinged hatch, no cupola, no drums,
unmarked. Same hull, running gear and F-34 gun.

Signature features: 60° glacis and 40° sloped side plates; five large 830 mm Christie double road
wheels with a wider gap between the 2nd and 3rd; rear drive sprocket with rollers; 550 mm waffle
track with a guide horn on every other link; the turret set well forward.

## Specs
| Dimension | Value (m) | Source |
|---|---|---|
| length with gun | 6.68 | https://en.wikipedia.org/wiki/T-34 |
| hull length | 5.92 | https://en.wikipedia.org/wiki/T-34 |
| width | 3.00 | https://en.wikipedia.org/wiki/T-34 |
| height | 2.45 (1943 with cupola) / 2.40 (1941) | https://en.wikipedia.org/wiki/T-34 |
| road wheel diameter | 0.83 | Zaloga & Grandsen, *T-34 in Action* |
| track width | 0.55 | Zaloga & Grandsen |
| F-34 barrel, L/41.5 | 3.162 | https://en.wikipedia.org/wiki/76_mm_tank_gun_M1940_F-34 |
| glacis / side plates | 60° / 40° from vertical | https://en.wikipedia.org/wiki/T-34 (armour) |

## Photos
| View | URL | Date / unit | Notes |
|---|---|---|---|
| left side, turret slogan | https://commons.wikimedia.org/wiki/File:Tank_Lidice,_čs._armáda_v_SSSR.png | 1943–44, 1st Czechoslovak Independent Brigade in the USSR | hex turret with cupola; white «LIDICE» in quotes on the turret side; cylindrical fuel drums on the hull side; tank riders |
| river crossing | https://commons.wikimedia.org/wiki/File:RIAN_archive_633180_Stream_crossing.jpg | 1943–44 (RIAN) | Model 1943 silhouettes with desant; no visible markings |
| category | https://commons.wikimedia.org/wiki/Category:T-34_Model_1943_tanks_during_World_War_II | — | 13 wartime photos, including the Estonian regiment «За Советскую Эстонию» set (AMN33772…) |

Markings modelled: «LIDICE» in white block capitals on both rear-side turret faces (1943 only).
The 1941 variant is unmarked, since no dated photo of a marked 1941 turret was found.

## Finish and wear (`field.ts`, shared with `tiger_1`)
| What | How | Where it is measured |
|---|---|---|
| 4BO green | project material `armour_paint` (matte film, 8 % flakes) at true scale; vertex colour = the paint | — |
| plate-edge chipping | `chipFlecks`: 420 (hull) + 170 (turret) ragged flecks 1.5 mm proud, crowded against plate edges; weld beads laid in 12 cm runs (painted, rubbed to steel, rusted) | geometry (LOD0) |
| edge rub, mud, rust runs | `weather()` through `fieldWear`: chips on convex edges 40 %, dried mud over 50 % of the 2 m splash band, rust streaking down from the rail stanchions and exhaust flanges | manifest `weather`, QA `weather` |
| road dust | a soft haze on up-facing plates (0.24; half at LOD2) | — |
| wheels | radial mud (`wheelMud`): packed on tyre and rim, ragged toward the hub, turns with the wheel | — |
| track | dark manganese steel plate, road-polished grouser bars, mud packed between them; one link finished and laid round the belt (the `treads` gate needs every link alike) | QA `treads` |
| exhaust | soot plumes up the rear plate from both pipes; muzzle blackened | — |

The turret is a casting: plan corners filleted, wall rolled into the roof over a 7.5 cm radius
(`castShell`; LOD1 one chamfer, LOD2 sharp).

## Mass
26.5 t combat weight (https://en.wikipedia.org/wiki/T-34, T-34/76 Model 1941–43). The model is
hollow, so `physics.shell` and per-part walls stand for it: hull 30 mm over the model's faces
(≈ 15.6 t: armour plus engine, gearbox, fuel, ammunition), turret 45 mm (4.2 t with the gun
mount), 12 mm pressed wheel discs (≈ 250 kg a road wheel), tracks at a quarter solid
(≈ 1.17 t a side), fittings as 4 mm sheet. Computed 27.3 t (+3 %; gate ±10 %).

## Turret position
The critique asked whether the turret sits too far forward. The ring centre is 2.51 m behind the
nose (x = +0.45 on a hull of ±2.96), which puts the mantlet between the first and second road
wheels. The T-34/76's turret is set well forward (a signature of the type, see Identity), so it
is left where it was; it has not been checked against a dimensioned side elevation (no
dimensioned drawing in the sources above gives the ring station).

## Parts the engine needs
`turret` (sway ±20° about Z), `gun` (sway ±5° about Y), `wheel_{l,r}_{0..4}`, `idler_*`,
`sprocket_*` (spin), `track_l/r`, emitters `exhaust_smoke_l/r`, `track_dust_l/r`, `muzzle`.

## Open questions
- Web search hit its quota while I was looking for a dated «За Родину» photo; the Cyrillic slogan
  option (glyph set) is left for a follow-up.
- The fuel drums push the width to 3.13 m (still inside the 5% box). On the real tanks they sit
  just as proud of the side plates.
- Triangles 58.1k / 12.6k / 1.49k (1941: 57.2k / 12.3k / 1.45k): LOD2 is now inside the AFV
  playbook band (≤ 1.5k), so the `t34` / `t34_1941` rows in `scripts/lib/budget-baseline.ts` can go.
- 19 draws: one per spinning wheel pivot, track, turret and gun; the static hull is one.
