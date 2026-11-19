# Sunstone deposit — resource node (original)

## Identity
The Saltmarch kit's resource node (style guide: [`../rts_faction/README.md`](../rts_faction/README.md)):
a **basalt outcrop** (SDF with fracture planes, noise pitting) with a **white salt crust** on
upward faces and four clusters of **amber sunstone crystals** (glow). The rock is neutral; a
**team claim stake** (pennant + flat chevron plaque) shows who mines it. `rts_resource_depleted`
is the same seeded rock harvested: main cluster quarried out (a scoop), the rest sheared to
dull stubs, spoil dust.

## Specs
| Dimension | Value (m) | Source |
|---|---|---|
| envelope (full) | 4.93 × 3.78 × 3.90 | original design, as built (side clusters 0.8 of the lead cluster) |
| envelope (depleted) | 4.93 × 4.34 × 2.80 | original design, as built (spoil heap widens it) |

## Photos (by view)
Original design — rock forms from [`docs/playbooks/nature/rocks.md`](../../docs/playbooks/nature/rocks.md).

## Parts the engine needs
`mine_point_0…3` (interact sockets, `resource: sunstone`), `glint` sparks, `dust` (depleted),
team part `claim_pennant`.

## Open questions
Intermediate depletion steps (75 % / 50 %) would be more `depleted` params; two states ship.
