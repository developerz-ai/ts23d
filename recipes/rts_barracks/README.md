# Saltmarch Warden Hall — barracks, 3 stages × 3 damage states (original)

## Identity
The Accord's barracks (style guide: [`../rts_faction/README.md`](../rts_faction/README.md)), one
`defineFamily` exported as nine assets. Signature features: bone block hall on a slate plinth,
**team slate gable roof** (lapped courses, each slate its own value: faded at the ridge, a dark drip
course at the eaves) with a ridge roll, two rear **drum towers with team cones**, arrow slits, a
door up two steps and amber beacons, a **pitched team porch** on oak posts over the recessed gate
(stone portal, keystone, bracket lamp), framed amber windows (stone sill, head, jambs, iron
mullion cross) and a brass oculus, team banners. Ruins keep a 4 m corner and a tower stub standing
with a broken stepped crown; build stages carry lashed timber scaffolding with a ladder and a
gin-pole hoist, or a working yard (draped tarps, stickered oak stack, setting-out lines, mortar
tub, wheelbarrow, a hod, sheer-legs over the −Y footing with a stone on its rope).

Surfaces carry the story at hero distance (`surface.ts`, `yard.ts`): roofless stages stand on a
**flagstone floor** (1 m flags, each its own tone, 4 cm joints) stained per stage (trodden mud and
mortar splash on a site, scorch and ash in a ruin) with the **team chevron painted on the flags**
(worn: every flag's piece its own shade, some flaked off); walls are dressed blocks with ±12% value
and warmth jitter, rising damp at the foot, rain streaks under the sills (finished hall: front-corner
quoins and a string course at sill level), lime mortar runs below a wall going up. Damage and ruin
soot goes on after weathering (`soot()`): near-black patches on broken wall tops, hole rims, tower
crowns; slates round the roof hole burnt black (`roof_burnt`, no team paint); fallen roof pieces
charred, every other one burnt through, ash lying on them; a charred door frame stands in a ruined
gate, a burnt shed frame on a ruined site. A raided site has its slab corner broken into tilted
pieces (pale fresh fractures, snapped formwork) with a scorch on the ground round it.

| | intact | damaged | rubble |
|---|---|---|---|
| **complete** | `rts_barracks` | `rts_barracks_damaged`: 3 shell holes + scorch, two roof strips gone (rafters show), one tower broken, torn banner, debris; smoke ×4, fire | `rts_barracks_rubble`: wall stubs, heap, charred beams, fallen team roof slabs, smouldering |
| **scaffold** | `rts_barracks_scaffold`: walls ~5 courses, scaffold + team tarp, floor inlay, build dust | `_scaffold_damaged` | `_scaffold_rubble` |
| **foundation** | `rts_barracks_foundation`: plinth, first course, team-tarped block pallets, timber, survey banner | `_foundation_damaged`: blast scorch, scattered blocks, smoke | `_foundation_rubble` |

Damage is the same seeded wall plan (`plan.ts`) with cells removed, so all LODs agree.

## Specs
| Dimension | Value (m) | Source |
|---|---|---|
| hall footprint | 10 × 14 | design brief |
| wall height (eaves) | 5.1 (0.6 plinth + 9 × 0.5 courses) | design brief |
| roof pitch | 26° | design brief |
| gate height | 3.5 (`measures`) | ×1.8 a 1.92 m Warden |
| complete envelope | 15.78 × 18.5 × 11.05 | measured design envelope |
| rubble envelopes | 13.3 × 18 × 4.1 (complete), 14.6 × 19.03 × 4.13 (scaffold), 15.47 × 18 × 3.46 (foundation) | measured: standing corner, tower stub, askew survey banner |

## Photos (by view)
Original design — scale from [`docs/playbooks/buildings/house.md`](../../docs/playbooks/buildings/house.md).

## Parts the engine needs
`rally` (spawn socket), `door` (interact), emitters `smoke_*`, `fire_0`, `tower_r_smoke`,
`build_dust`; team parts `roof_l`, `roof_r`, `roof_ridge`, `porch_roof`, `tower_*_cap`, `banner_*`,
`tarp(s)`, `floor_emblem`, `fallen_roof`.

## Budget
Triangles per LOD as built (2026-11-19): complete 36.8k / 7.8k / 664, damaged 33.7k / 8.0k / 852
(both under their ratchet baseline); every other stage under the 20k / 6k / 800 building band
(largest: scaffold damaged 17.2k / 4.6k / 662).

## Open questions
A "burning" state between damaged and rubble is the damaged asset + its fire/smoke emitters.
