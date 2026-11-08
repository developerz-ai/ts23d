# Saltmarch Warden Hall — barracks, 3 stages × 3 damage states (original)

## Identity
The Accord's barracks (style guide: [`../rts_faction/README.md`](../rts_faction/README.md)), one
`defineFamily` exported as nine assets. Signature features: bone block hall on a slate plinth,
**team gable roof** (strips along the ridge), two rear **drum towers with team cones** and amber
beacons, a **chevron porch** on two pillars, amber window slits and a brass oculus, team banners.

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

## Photos (by view)
Original design — scale from [`docs/playbooks/buildings/house.md`](../../docs/playbooks/buildings/house.md).

## Parts the engine needs
`rally` (spawn socket), `door` (interact), emitters `smoke_*`, `fire_0`, `tower_r_smoke`,
`build_dust`; team parts `roof_*`, `tower_*_cap`, `banner_*`, `tarp(s)`, `floor_emblem`, `fallen_roof`.

## Open questions
A "burning" state between damaged and rubble is the damaged asset + its fire/smoke emitters.
