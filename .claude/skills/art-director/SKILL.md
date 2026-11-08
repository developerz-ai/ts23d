---
name: art-director
description: A game-art director's workflow for ts23d — style guides / art bibles as code (palettes with roles, proportion and scale rules, material and wear conventions, LOD and budget policy), exemplar assets, consistent review with the critique rubric, keeping a whole set of assets (a city, a fleet, a bestiary) visually coherent. Use when defining or enforcing a style across several assets, reviewing a batch of recipes, planning an asset set, or when assets look like they come from different games.
---

# Game art director

Use with [16-art-as-text](../../../docs/idea/16-art-as-text.md), the
[critique section of author-recipe](../author-recipe/SKILL.md#critique-score--8-on-every-criterion-before-done),
[06-qa critique](../../../docs/idea/06-qa.md), [materials](../../../docs/architecture/materials.md)
and the other discipline skills (load the right one per asset). The guide is law until amended;
exceptions are written back into it. Styles are original: never "in the style of" a named game.

## When
More than one asset must look like one world; a set is planned (fleet, street, bestiary); a batch
of recipes needs review; critique scores disagree between assets.

## Workflow
| # | Art-direction stage | ts23d | Exit |
|---|---|---|---|
| 1 | Pillars: 3 words for the look (e.g. "weathered, industrial, warm") and the realism level | style module `recipes/_lib/style/<world>.ts` (code, not a PDF) | pillars + realism level written |
| 2 | Palette with roles | `definePalette({ primary, secondary, accent, metal, ground… })`; existing `palettes.*` for reference | every colour has a role and a share |
| 3 | Proportion and scale rules | constants: heads-per-height, door height, grid `G`, wheel/door scale; `real.measures` per asset | one module every recipe imports |
| 4 | Material and wear conventions | allowed strips, `paint` slot names, `finishes`, `weathered({ age, wet, wear })` presets, `grime` strength | one wear story per world |
| 5 | Budgets and LOD policy per class | shared `budget` constants; `ctx.pick` patterns; texel range for `assertTexelDensity` | budgets table in the style module |
| 6 | Exemplars | 1–3 hero assets built to the guide first; others measured against them | exemplars score ≥ 8 in critique |
| 7 | Production | discipline skills per asset; `defineFamily` for variants; `ctx.use` for sets | every asset imports the style module |
| 8 | Review cadence | `bun run shots`, `t3d critique` per asset, contact sheets side by side; gallery (`bun run site:dev`) | scores ≥ 8, consistent reasons |
| 9 | Enforce | tests per asset: palette membership, texel range, budgets, silhouette; new rule → script in `bun run verify` | a stray asset fails a test |

## Vocabulary → measurable
| Word | Meaning here | Check |
|---|---|---|
| Art bible / style guide | the rules every asset follows, as importable code + a short doc | style module imported by recipes |
| Palette role | primary / secondary / accent / neutral, with approximate area share (e.g. 60 / 30 / 10) | test: vertex colours within ΔE of the palette **(write it; no built-in)** |
| Realism level | real-scale PBR vs stylised exaggeration, declared | dossier + material ranges (`assertValueRange`) |
| Consistency | same texel density, bevel scale, wear strength, palette across a set | `assertTexelDensity`; shared constants |
| Scale reference | doors, stairs, a 1.8 m human | `t3d blueprint` figure |
| Readability | silhouette first, value before colour, focal contrast | `assertLodSilhouette`; focal check **planned** |
| Exemplar | the asset others are judged against | critique side by side |
| Critique score | 0–10 per criterion: silhouette, proportions, materials, detail, wear, lod, technical; pass ≥ 8 | `critique.json`, recipes gate (warn mode today) |

## Quality bar
- [ ] Pillars, palette roles, scale rules, wear and budgets live in one imported module.
- [ ] Every asset in the set passes the same tests (texel range, budgets, silhouette).
- [ ] Contact sheets side by side look like one world: same light, value range, wear level.
- [ ] Exemplars exist and score ≥ 8 on every criterion.
- [ ] Exceptions are recorded in the style module with a reason.
- [ ] Reviews are harsh and specific: each low score names a recipe change.

## Common mistakes
- A style guide as prose only: nothing enforces it, assets drift.
- One reference game as the whole style: it becomes a clone. Use many references, invent the look.
- Mixing realism levels (photoreal crates beside cartoon characters).
- Each asset inventing its own bevel width, wear strength and palette.
- Scoring generously; "QA PASS" treated as "art approved".

## Run order
```sh
bun run t3d build recipes/<name>/<name>.ts --out out        # QA per LOD, exit 1 on a finding
bun run t3d shot recipes/<name>/<name>.ts --out renders     # READ sheet.png
bun run t3d hero recipes/<name>/<name>.ts --out renders     # READ hero.png
bun run t3d blueprint recipes/<name>/<name>.ts --out renders  # READ blueprint.png
bun run site:dev                          # gallery: the set side by side
bun run t3d critique recipes/<name>/<name>.ts --out tmp/critique  # READ every PNG, fill critique.json
bun run shots <name>                      # refresh committed out/
```

## Pairs with
- [concept-artist](../concept-artist/SKILL.md): exploring the look.
- [material-artist](../material-artist/SKILL.md): palette and wear presets.
- [technical-artist](../technical-artist/SKILL.md): budgets per class.
- [presentation-artist](../presentation-artist/SKILL.md): review images.
- Every discipline skill: load the one that matches each asset.

## Tool status
Shipped: `definePalette`/`palettes`, one trim sheet, `defineFamily`, `ctx.use`, shared parts,
`assertTexelDensity`, `assertValueRange`, `assertLodSilhouette`, `t3d critique` + `critique.json`,
gallery site. Planned / gaps: palette-membership and cross-asset consistency gates (none built in),
focal/value checks, optional CI fresh-eyes reviewer, enforced critique mode, `variations(n)`.
Neutral positioning: the free code-based option, no claims against other tools.
