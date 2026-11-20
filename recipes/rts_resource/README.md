# Sunstone deposit — resource node (original)

## Identity
The Saltmarch kit's resource node (style guide: [`../rts_faction/README.md`](../rts_faction/README.md)):
a **basalt outcrop** (SDF cut deep by ten fracture planes into flat faces a metre or more across, two ledges, light
pitting, three cracks run down the front faces as 22 cm grooves the salt packs white; UVs projected
per face (`../_lib/terrain/strip-inset.ts`) so no stretched band shows; lava beds 15–45 cm thick
with near-black wavy partings as full-contrast value strata, which the strip's grain cannot blur) with **white salt** packed in its
crevices and dusted on level tops only (the far rock averages the near colour over each vertex's
patch and keeps a quarter of its salt, so LOD2 holds LOD0's mean value; tested), and four clusters of **amber sunstone crystals** (glow
0.5: lit from within, facets still shade; deep amber cores, bright edges). Pale fresh pick gouges
round the worked pocket and trampled mud on the crew's side; a harvested node's stubs are sheared
flat (one pale cut plane each), its scoop has a sharp rim, seven pick gouges (32 × 68 cm, dark
fresh-cut basalt with no salt or dust) hacked into its wall against a broad pale spoil-dust ring
round the rim; its hero looks down into the scoop from the worked side (50°). The rock is neutral; a
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
