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
tub, wheelbarrow).

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
`build_dust`; team parts `roof_*`, `tower_*_cap`, `banner_*`, `tarp(s)`, `floor_emblem`, `fallen_roof`.

## Open questions
A "burning" state between damaged and rubble is the damaged asset + its fire/smoke emitters.
