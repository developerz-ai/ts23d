# Saltmarch Brinehound — light tank (original)

## Identity
The Accord's light tank (style guide: [`../rts_faction/README.md`](../rts_faction/README.md)).
An original design in the light-tank class, not a copy of any vehicle. Signature features: low
**pebble hull** with a sloped glacis and a **plan-V chevron prow** plate, a **chevron-nosed
turret** whose roof is one **team plate**, a round mantlet on the nose with a brass muzzle brake,
team chevrons on the fenders and a team engine-deck panel, five road wheels + idler + toothed
sprocket per side, link-by-link tracks.

## Specs
| Dimension | Value (m) | Source |
|---|---|---|
| length (gun forward) | 6.13 | design brief |
| width (over tracks) | 3.05 | design brief, AFV playbook light-tank range |
| height (with antenna) | 3.20 | design brief |
| road wheel Ø | 0.60 | AFV playbook (WW2 medium 0.5–0.85) |
| track width | 0.46 | AFV playbook (0.4–0.55) |

## Finish and wear (Nov 2026 quality pass)
| What | How |
|---|---|
| bone and slate paint | project material `armour_paint` (`../_lib/finish/field.ts`: matte film, 8 % flakes) at true scale; the library `steel_painted` chipped a fifth of the film in dashes that read as wood grain. Team plates stay on `steel_painted` and are never weathered |
| edge chips, salt dust, brine mud | `weather()` per space (`Kit.commit`): hull mud covers 80 % of the 1.1 m splash band (belly excluded), manifest `weather` |
| wheels | slate-painted discs with radial mud (`wheelMud`), tyres on a rough greyscale strip so the mud shows |
| track | one link worn in its own space (chips, pale salt crust), laid round the belt (`treads` gate) |
| exhaust | a soot plume over each stack onto the rear deck and a streak down the rear plate (vertex colour on a 25 cm hull), plus the measured soot stain |
| detail | bolt rows on the glacis applique plates and round the turret roof plate, a tow cable on two hooks on the rear plate, three skirt plates a side with hanger bolts |

Turret plan ×1.23 and 12 cm taller than the first cut (RTS exaggeration); the barrel is 15 cm
shorter so the overall length holds: the gun stands 2.1 m ahead of the trunnion on a 5.24 m hull
(0.40), inside the light-tank range of the AFV playbook examples.

## LOD and draws
32.1k / 8.3k / 598 triangles. LOD2 keeps five road wheels a side as six-triangle cones on a dark
block inside the belt (static, drawn with the hull), a skirt strip a side and 20 belt slabs.
Draws 23 / 23 / 7: one per spinning pivot at LOD0/1 (14 wheels, 2 belts, turret, gun) plus the
team-paint parts and the static body. The wheels cannot share a draw while each spins about its
own axle (the engine contract below); LOD2 drops them to empty pivots.

## Photos (by view)
Original design — scale only from [`docs/playbooks/vehicles/afv.md`](../../docs/playbooks/vehicles/afv.md).

## Parts the engine needs
`turret` (spin Z, 0.05 rps), `gun` (sway ±4° elevation; trunnion just ahead of the turret nose so
it clears without `clearOf`), `wheel_l_0…4` / `_r_`, `idler_*`, `sprocket_*` (spin Y; pivots kept
at LOD2; +rps = forward), `track_l/_r` (tread: 96 / 44 / 20 links one pitch apart, pitch = loop
length 11.014 m ÷ link count = 0.1147 / 0.2503 / 0.5507 m, so the `run` clip moves the belt at every
LOD; LOD2 adds a static `track_core_l/_r` block with a cone per road wheel where the wheels were), emitters `muzzle` (event), `exhaust_l/_r`, `dust_l/_r` (moving), seat `commander`.

## Open questions
None.
