# Saltmarch Warden — line infantry (original)

## Identity
The Saltmarch Accord's rifleman (style guide: [`../rts_faction/README.md`](../rts_faction/README.md)).
Signature features: domed bone helmet with a **forward chevron crest** (team), dark visor housing
with an **amber slit**, big **team pauldrons**, team chest stripe and pack flap, the boxy
**sunlance carbine** (cooling rings, brass muzzle collar, amber cell) held at the hip.

## Specs
| Dimension | Value (m) | Source |
|---|---|---|
| height (to antenna tip) | 1.95 | design brief |
| length (carbine forward) | 1.36 | design brief |
| width (pauldrons) | 0.82 | design brief |
| carbine grip Ø | 0.038 | fits the fist (grip joint QA) |

## Photos (by view)
Original design — no photo references; see the faction brief for proportions and palette.

## Parts the engine needs
`hand_r_socket` (mount, weapon `sunlance`), joint `grip_r` (hand_r → rifle_grip, kind grip),
`muzzle` emitter (event), team parts: `pauldron_*`, `crest`, `chest_stripe`, `pack_flap`.

## Open questions
Skinned rig is planned in the library; parts are named per limb so a rigger can bind them.
