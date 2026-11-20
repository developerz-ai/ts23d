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
| bone and slate paint | project material `brine_enamel` (defined in `rts_tank.ts`: smooth matte film, 1.5 % flakes, no rust runs) at true scale; the runs and dashes of `steel_painted` and of the field tanks' `armour_paint` read as wood grain on the big pale plates. Team plates stay on `steel_painted` |
| team-paint wear | the `team` slot is a wear slot (`TEAM_PAINT_WORN`, `../_lib/rts/style.ts`): the turret roof and engine-deck team plates are weathered in their own group (`painted: true`, sampled every 18 cm at LOD0, 1.2 m at LOD1): 30 % of the edges chipped to dark bare steel, 10 % salt dust on top, and the stacks' soot over the deck plate's tail. Each chip's border is cut inside the triangles at a ragged point of every mixed edge (`settleWear`, core paint-wear), so chips come out irregular, not a sawtooth of lattice triangles. The bare pieces export unpainted, so every livery recolours the paint and keeps the wear. The small fender chevrons stay clean (their concave prism tessellates badly) |
| brine mud, salt dust | `fieldGrade` (`../_lib/finish/afv.ts`): red-brown clay mud opaque up to ~0.9 m and gone at 1.22 m with a ragged edge (over the rear plate at the tail), wet mud lowest, on lower hull, prow and skirts (cut to 25 cm at LOD0 so the edge has vertices); dust (0.5) only on the deck and what faces the sky on the turret |
| edge chips | `weather()` per space (`Kit.commit`): 5 % of the convex edges (more smeared dashes along the tessellation), manifest `weather` |
| wheels | a dished slate disc out to the rim seat and the rubber tyre as its own band round it (the old solid tyre cylinder's cap covered the dish and showed pale); `wheelDirt`: dark tyre, mud in the outer dish, brass hub clean |
| track | one link worn in its own space (chips, pale salt crust), laid round the belt (`treads` gate) |
| exhaust | a soot fan (1.15 m) from each stack over the rear plate and the deck's tail (vertex colour on a 25 cm hull), plus the measured soot stain |
| lamps | headlamps: a slate bucket sunk into the glacis, an iron bezel ring and a small domed amber lens set back in it; the turret sensor likewise (housing and bezel plain, only the lenses glow at 1.2) |
| detail | bolt rows on the glacis applique plates and round the turret roof plate, a tow cable on two hooks on the rear plate, three skirt plates a side with hanger bolts |

Turret plan ×1.23 and 12 cm taller than the first cut (RTS exaggeration); the barrel is 15 cm
shorter so the overall length holds: the gun stands 2.1 m ahead of the trunnion on a 5.24 m hull
(0.40), inside the light-tank range of the AFV playbook examples.

## LOD and draws
37.5k / 9.4k / 590 triangles (the team-plate wear and its cut chip borders cost ~2.3k / 0.2k). LOD2 is an open belt of 18 slabs a side with all seven wheels in
it as two-polygon discs (dark eight-sided tyre, six-sided slate disc with the near dish's mean
mud: 10 triangles), a skirt strip a side and two amber hexagons where the headlamps are (plain
amber, drawn with the body).
Draws 23 / 9 / 7. LOD0, the close-up LOD, spins each of the 14 wheels on its own pivot (one draw
each) beside 2 belts, turret, gun, the team-paint and glow parts and the static body. LOD1, the
strategy camera's LOD, keeps the pivots empty and draws the wheels as one static part a side
(`wheels_l/_r`) with the hull: 14 fewer draws per unit where hundreds are on screen; LOD2 the same.

## Photos (by view)
Original design — scale only from [`docs/playbooks/vehicles/afv.md`](../../docs/playbooks/vehicles/afv.md).

## Parts the engine needs
`turret` (spin Z, 0.05 rps), `gun` (sway ±4° elevation; trunnion just ahead of the turret nose so
it clears without `clearOf`), `wheel_l_0…4` / `_r_`, `idler_*`, `sprocket_*` (spin Y; meshes at LOD0,
empty pivots at LOD1/2 where static `wheels_l/_r` stand for them; +rps = forward), `track_l/_r`
(tread: 96 / 44 / 18 links one pitch apart, pitch = loop length 11.014 m ÷ link count = 0.1147 /
0.2503 / 0.6119 m, so the `run` clip moves the belt at every LOD), emitters `muzzle` (event), `exhaust_l/_r`, `dust_l/_r` (moving), seat `commander`.

## Open questions
None.
