# Finish demo — a EUR pallet with a crate and an oak cask

## Identity
A teaching asset for the AI finish layer ([22-ai-finish](../../docs/idea/22-ai-finish.md)), not a
scene: three code-built props, each with its own use wear, that `t3d finish` weathers further
without changing any part, pivot or dimension.
- **EUR pallet** — EN 13698-1 footprint and height; three bottom boards, nine blocks, three stringer
  boards, five deck boards; deck nail heads (LOD0). Wear: timber greyed by sun and rain, mud
  splashed up every side face (darkest at the foot), the deck grimed board by board, two grease
  spills beside the cask on the −Y deck board (lobes of overlapping ellipses turned every way, a
  ragged edge and a trail of drips), chipped edges (`weather()`).
- **Crate** — 0.55 × 0.75 × 0.6 m (`props.ts`): three planks a face with 5 mm seams over a dark
  core, four lid boards, edge battens proud of the planks, a diagonal brace on every face, nail
  heads where the battens cross (LOD0), a stencilled `FRAGILE` on the −Y face (LOD0). Wear: the
  +X −Y corner batten's top split off by a knock and hanging skewed, mud splashed up the bottom of
  every face, chipped battens and a dusty lid.
- **Oak cask** — 0.8 m tall, head Ø 0.48 m, bilge Ø 0.57 m (`props.ts`): 28 staves as flat facets,
  each its own tone of seasoned (grey-brown) oak; the head recessed 25 mm inside the chime, mapped planar onto the oak strip as
  four straight boards (grain along Y, three dark joints at LOD0/1; the lathe's round-the-axis U
  drew a swirl); four
  iron hoops with two rivets at each lap (LOD0); a bung in the bilge stave facing the viewer, wine
  weeping from it down the staves.

LOD policy (inside the generic prop band 5k / 1.5k / 300): LOD0 ≈ 4.6k, LOD1 ≈ 1.45k, LOD2 ≈ 296.
LOD2 keeps the pallet's nine blocks and three bottom boards (both fork openings still show
daylight), the crate's frame (corner battens plus top and bottom battens as quads, a deep shade so
it reads; no chips there, which would bleach the thin quads) and the cask at 12 staves with its two
inner hoops.

## Specs
| Dimension | Value (m) | Source |
|---|---|---|
| pallet length × width | 1.200 × 0.800 | https://en.wikipedia.org/wiki/EUR-pallet (EN 13698-1) |
| pallet height | 0.144 | https://en.wikipedia.org/wiki/EUR-pallet |
| board thickness / block height | 0.022 / 0.078 | EN 13698-1 (via the EUR-pallet article) |
| cask height × bilge Ø (small ≈ 110 l cask) | 0.80 × 0.57 | chosen; https://en.wikipedia.org/wiki/Barrel#Wine_barrels for proportions (a 225 l barrique, 0.95 × 0.70, would overhang the pallet beside the crate) |

## Photos (by view)
| View | URL | Notes |
|---|---|---|
| EUR pallet, 3/4 | https://en.wikipedia.org/wiki/EUR-pallet | board and block layout |
| oak barrels | https://en.wikipedia.org/wiki/Barrel | hoop placement |

## The finish
```
bun run t3d finish recipes/finish_demo/finish_demo.ts --model mock \
  --prompt "soot and grime, rust streaks on the iron hoops, worn edges"
```
[`finish/compare.png`](finish/compare.png): before (the compiled base colour) | after (mock finish),
same simple light. [`finish/finish_albedo.png`](finish/finish_albedo.png): the 1024² atlas.
[`finish/finish.json`](finish/finish.json): provenance, 55 % of texels seen directly, zero mask leak,
palette drift ΔE 2.5–6 (bound 25), QA clean.

## Parts the engine needs
`pallet`, `crate`, `cask` — static props, one pivot each.

## Open questions
None: dimensions are standard; the cask size is a chosen small cask.
