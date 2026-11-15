# 17 — Flagships to ≥ 8.5, GPU variants, gallery CPU/GPU toggle (recipes + site)

Rule: the flagships prove the programme; the gallery shows every flagship on both tiers with credits.

## Files
| Path | State | Why |
|---|---|---|
| `recipes/wolf/wolf.ts`, `wolf.test.ts` (README + ref.json moved to slice 05) | changed | opt into cubic kernel, detail regions, fur cards, clips, hero tier, `ref`; GPU hybrid variant |
| `recipes/amur_tiger/*` | changed | same upgrades (custom recipe, not the kind: port stages that apply) |
| `recipes/dragon/*` | changed | same; concept-turnaround ref (15) |
| `recipes/*/neural/` for flagships | new | committed GPU outputs + `record.json` (models whose licence allows publishing outputs) |
| `showcase.config.ts` | new | the best-looking adapter/model per task for the gallery build |
| `scripts/lib/critique.ts` | — | owned by 03; this slice only raises the floor constant via the coordinator |
| `apps/site/src/tier-toggle.ts` + test | new | CPU / GPU variant switch per asset |
| `apps/site/src/credits-panel.ts` | new | model + licence from `record.json`, data attribution |
| `apps/site/src/viewer.ts`, `viewer-panels.ts`, `items.ts`, `recipe-modules.ts` | changed | load variant GLBs, play named clips (09), skeleton display |
| `apps/site/src/showcase.ts` | changed | flagship order, before/after (old outputs kept as `before.png`) |

## Depends on
All earlier slices.

## Change
- Iterate per flagship: build → shot → hero (path) → review → critique until calibrated ≥ 8.5 (target 9); record each round's score in the README.
- Then coordinator flips `T3D_CRITIQUE_BELOW_FLOOR` to enforce for flagships.
- Gallery wording neutral: "CPU tier" / "with model X" — no comparisons with products.

## Tests
Recipe tests hold measures, ref IoU, clip names; site unit tests for the toggle and credits.

## Checks
`bun run shots wolf amur_tiger dragon human_head elf_head goblin_head orc_head` · `bun run site:build` · `--only recipes`

## Docs
Recipe READMEs; `apps/site/DESIGN.md` toggle.

## Done when
All seven flagships ≥ 8.5 calibrated and enforced; site build shows both tiers.
