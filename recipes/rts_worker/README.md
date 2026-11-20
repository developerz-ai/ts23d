# Saltmarch Delver — worker (original)

## Identity
The Saltmarch Accord's builder and miner (style guide: [`../rts_faction/README.md`](../rts_faction/README.md)).
Same body as the Warden, but round where the soldier is chevroned: a **team cap** with amber
goggles, a **tool backpack** (team lid with a rolled tarp across it, brass canister, cable coil,
spare pick head, a shovel slung across it) and a **sunstone pick** carried across the body in both
hands, its head out past the left shoulder. From the RTS camera the pack + cap say "worker". Wear:
pale caked mud to the knees (mud shell on its own grey strip), dented pack corners, salt dust on
the shoulders, pack and tarp.

## Specs
| Dimension | Value (m) | Source |
|---|---|---|
| height | 1.83 | design brief |
| length (pack to boot toe) | 0.83 | design brief, work pose (pick carried across the body) |
| width (pick handle to pick head) | 0.75 | design brief, work pose (pick carried across the body) |
| standing height, boot sole to cap crown (body only; `measures`, ±2 %) | 1.83 | design brief |
| pick handle Ø | 0.036 | fits the fist (grip joint QA) |

## Photos (by view)
Original design — no photo references.

## Parts the engine needs
`hand_r_socket` (mount, tool `pick`), joint `grip_r` (hand_r → tool_handle), `work_dust`
emitter (event), team parts `cap`, `pack_lid`.

## Open questions
None.
