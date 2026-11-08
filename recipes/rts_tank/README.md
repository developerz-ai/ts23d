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

## Photos (by view)
Original design — scale only from [`docs/playbooks/vehicles/afv.md`](../../docs/playbooks/vehicles/afv.md).

## Parts the engine needs
`turret` (spin Z, 0.05 rps), `gun` (sway ±4° elevation; trunnion just ahead of the turret nose so
it clears without `clearOf`), `wheel_l_0…4` / `_r_`, `idler_*`, `sprocket_*` (spin Y; pivots kept
at LOD2), emitters `muzzle` (event), `exhaust_l/_r`, `dust_l/_r` (moving), seat `commander`.

## Open questions
Track UV scrolling is an engine concern; the belt is static geometry.
