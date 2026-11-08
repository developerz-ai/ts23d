# Finish demo — a EUR pallet with a crate and an oak cask

## Identity
A teaching asset for the AI finish layer ([22-ai-finish](../../docs/idea/22-ai-finish.md)), not a
scene: three plain, code-built props with clean trim-sheet surfaces that `t3d finish` weathers
without changing any part, pivot or dimension.
- **EUR pallet** — EN 13698-1 footprint and height; three bottom boards, nine blocks, three stringer
  boards, five deck boards.
- **Crate** — the kit `crate` part, 0.55 × 0.75 × 0.6 m, battens and end braces.
- **Oak cask** — the kit `barrel` part, `style: 'wood'`, 0.8 m tall, iron hoops.

## Specs
| Dimension | Value (m) | Source |
|---|---|---|
| pallet length × width | 1.200 × 0.800 | https://en.wikipedia.org/wiki/EUR-pallet (EN 13698-1) |
| pallet height | 0.144 | https://en.wikipedia.org/wiki/EUR-pallet |
| board thickness / block height | 0.022 / 0.078 | EN 13698-1 (via the EUR-pallet article) |
| cask height (small cask) | 0.80 | chosen; https://en.wikipedia.org/wiki/Barrel#Wine_barrels for proportions |

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
[`finish/finish.json`](finish/finish.json): provenance, 57 % of texels seen directly, zero mask leak,
palette drift ΔE 3.8–8 (bound 25), QA clean.

## Parts the engine needs
`pallet`, `crate`, `cask` — static props, one pivot each.

## Open questions
None: dimensions are standard; the cask size is a chosen small cask.
