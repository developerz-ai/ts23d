---
name: concept-artist
description: A concept artist's workflow for ts23d, done in text — design briefs, many thumbnails as inline SVG, shape language (circle/square/triangle), silhouette tests, value grouping, iteration through families and seeds, callout sheets and design dossiers for invented things (sci-fi, fantasy). Use when the asset is invented rather than real, when exploring design options before modelling, or when a critique says the silhouette or shape language is weak.
---

# Concept artist

Use with the [author-recipe loop](../author-recipe/SKILL.md) (step 1 "design dossier" for
invented assets), [16-art-as-text](../../../docs/idea/16-art-as-text.md),
[02-dsl "Drawing with SVG"](../../../docs/idea/02-dsl.md#drawing-with-svg) and the
[reading list](../../../docs/research/reading-list.md) (Valve readability guides). An agent cannot
paint pixels, but SVG is drawing as text and a family with seeds is a page of thumbnails.
Every design is original: no IP's characters, ships, logos or signature shapes.

## When
Sci-fi, fantasy, stylised or otherwise invented assets; choosing between design options; fixing a
weak silhouette; writing the design intent for an asset other skills will build.

## Workflow (concept pipeline → ts23d)
| # | Concept stage | ts23d | Exit |
|---|---|---|---|
| 1 | Brief: function, world, faction, scale, mood, 3 keywords | dossier "design intent"; real-world scale anchors (a door, a person, a container) | one paragraph + 3 keywords |
| 2 | Reference: real machines/animals/architecture that share the function | dossier links, by part | each major part has a real precedent |
| 3 | Thumbnails: many fast silhouettes | `defineFamily` with params for the big shape decisions; render variants with `t3d shot` (LOD2 FAR cell = thumbnail) | ≥ 6 options compared on silhouette alone |
| 4 | Shape language choice | dossier: dominant shape (circle / square / triangle), secondary, accent; ratio big : medium : small | stated intent per part |
| 5 | Silhouette drawings | inline SVG side / front / top; `svgShape` to check, `extrudeSvg` for plates, `visualHull` for organic | side view names the thing in black |
| 6 | Value and colour grouping | 3 value groups (light / mid / dark) assigned to parts; `definePalette` with roles | greyscale `hero.png` reads |
| 7 | Rough 3D (paint-over equivalent) | block-out in `box`/`prism`/`sculpt`; `t3d hero` | chosen design reads in 3/4 |
| 8 | Callouts / turnaround for handoff | dossier: part list with sizes and materials, motion, signature details; `t3d blueprint` | another skill can build it without asking |
| 9 | Review | `t3d critique` (silhouette, proportions) | silhouette score ≥ 8 |

## Vocabulary → measurable
| Word | Meaning here | Check |
|---|---|---|
| Silhouette | the solid outline; must name the thing without interior detail | `assertLodSilhouette`; `assertSilhouetteMatches(asset, view, mask, 0.8)` vs a drawn mask PNG |
| Shape language | circle = friendly/soft, square = stable/strong, triangle = dangerous/fast | metric (acute-angle share, taper) **planned**; state intent |
| Big-medium-small | 3 size tiers of shapes, roughly 60 / 30 / 10 % of area *typical* | review sheet |
| Value grouping | 3–5 value masses; no part's value fights the focal part | **planned** focal check; greyscale by eye |
| Focal point | where the eye lands; highest contrast and detail | declare in dossier; `focal` **planned** |
| Rest area | quiet surfaces that let detail read | **planned** metric |
| Gesture / line of action | one dominant curve through the design | side view |
| Exaggeration | a declared departure from real proportion (`jaw ×1.35`) | dossier + `measures` |
| Iteration | options differ in big shapes, not in decals | family params, seeds |

## Quality bar
- [ ] Brief and 3 keywords written before any geometry.
- [ ] ≥ 6 silhouette options considered; the choice explained in the dossier.
- [ ] Dominant shape language consistent across parts; accents deliberate.
- [ ] Silhouette reads from side and front at thumbnail size, LOD2 included.
- [ ] Value plan: 3 groups, focal part highest contrast.
- [ ] Every part has a real-world functional precedent and a plausible scale.
- [ ] Handoff dossier complete: parts, sizes, materials, motion, signature details.

## Common mistakes
- Iterating on surface detail while the silhouette is still undecided.
- Options that differ only in colour or decals.
- Shape language mixed at random: soft bubbles on an "aggressive" design.
- Even detail everywhere: no focal point, no rest.
- Invented things with no scale anchor (doors, hatches, seats sized for nobody).
- Designs that echo a famous IP's silhouette.

## Run order
```sh
bun run t3d build recipes/<name>/<name>.ts --out out        # QA per LOD, exit 1 on a finding
bun run t3d shot recipes/<name>/<name>.ts --out renders     # READ sheet.png
bun run t3d hero recipes/<name>/<name>.ts --out renders     # READ hero.png
bun run t3d blueprint recipes/<name>/<name>.ts --out renders  # READ blueprint.png
bun run t3d list recipes/<name>/<name>.ts                        # every family variant to compare
bun run t3d critique recipes/<name>/<name>.ts --out tmp/critique  # READ every PNG, fill critique.json
bun run shots <name>                      # refresh committed out/
```

## Pairs with
- [art-director](../art-director/SKILL.md): pillars and palette roles for the world.
- [character-artist](../character-artist/SKILL.md) / [creature-artist](../creature-artist/SKILL.md): building the chosen design.
- [hard-surface-artist](../hard-surface-artist/SKILL.md): invented machines.
- [presentation-artist](../presentation-artist/SKILL.md): value read.
- [material-artist](../material-artist/SKILL.md): colour groups to strips.

## Tool status
Shipped: `svgShape`, `extrudeSvg`, `latheSvg`, `visualHull`, `sd.silhouette`, `defineFamily`,
`definePalette`, `t3d shot` / `hero` / `blueprint` / `critique`, `assertSilhouetteMatches`,
`assertLodSilhouette`. Planned: shape-language and focal-point metrics, `t3d shot --ref` overlays
with per-view IoU, `variations(n)` thumbnails in one build.
Neutral positioning: the free code-based option, no claims against image or 3D generators.
