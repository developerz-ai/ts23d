# Saltmarch Warden — line infantry (original)

## Identity
The Saltmarch Accord's rifleman (style guide: [`../rts_faction/README.md`](../rts_faction/README.md)).
Signature features: domed bone helmet with a **forward chevron crest** (team), dark visor housing
with an **amber slit**, big **team pauldrons**, team chest stripe and pack flap, the boxy
**sunlance carbine** (cooling rings, brass muzzle collar, amber cell) carried at **port arms**:
diagonal across the chest, grip by the right hip, the left glove under the shroud, so the front view
reads the whole weapon. Wear that reads at hero distance: pale caked brine mud up the boots and
shins (a mud shell on its own grey strip, wet and dark at the soles), brine mud smeared up the
belly plates and pack, salt dust on the shoulders and helmet; the team pauldrons and pack flap
chipped to bare steel round their rims and salt-dusted on top, crest and chest stripe lightly
chipped (`teamWearOf`, slot `TEAM_PAINT_WORN`: that wear keeps its colour in every livery;
pauldrons and flap LOD0 only, crest and stripe LOD0/1); trousers bloused over the boots.

## Specs
| Dimension | Value (m) | Source |
|---|---|---|
| height (to antenna tip) | 1.95 | design brief |
| length (boot toe to pack) | 0.72 | design brief, port-arms carry pose |
| width (carbine stock to pauldron) | 0.97 | design brief, port-arms carry pose |
| pauldron span (body only; `measures`, ±2 %) | 0.82 | design brief (infantry shoulders 0.75–0.82) |
| carbine grip Ø | 0.038 | fits the fist (grip joint QA) |

## Photos (by view)
Original design — no photo references; see the faction brief for proportions and palette.

## Parts the engine needs
`hand_r_socket` (mount, weapon `sunlance`), joint `grip_r` (hand_r → rifle_grip, kind grip),
`muzzle` emitter (event), team parts: `pauldron_*`, `crest`, `chest_stripe`, `pack_flap`.

## Open questions
Skinned rig is planned in the library; parts are named per limb so a rigger can bind them.
