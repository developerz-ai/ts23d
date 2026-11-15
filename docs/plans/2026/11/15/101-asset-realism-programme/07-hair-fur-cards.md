# 07 — Hair flow field and cards: fur, guard hair, hair, beards (passes + kinds + material)

Rule: hair and fur break the silhouette with alpha-cutout strand cards laid along a combed flow field; no sculpted helmets.

## Files
| Path | State | Why |
|---|---|---|
| `src/passes/hair-flow.ts` + `.test.ts` | new | tangent flow field on a mesh: seeds from bone chains (tailward, distal, gravity), Jacobi smoothing on the vertex graph, projected to the tangent plane |
| `src/passes/hair-cards.ts` + `.test.ts` | new | Poisson-disk (`ctx.rng`) roots per zone density, 2–3 segment strips bent along flow with lift angle, roots sunk 2–5 mm, colour from root paint, UVs into the strand atlas |
| `src/material/strands.ts` + `.test.ts` | new | 8–16 clump cells on a cutout strip: seeded tapered splines, alpha + root→tip tone, strand normal; fur, guard hair, human hair, beard variants |
| `src/material/creature.ts` | changed | `fur_cards`, `hair_cards` strip ids (cutout, ADR 008) |
| `src/kinds/creature-fur.ts` + `.test.ts` | new | zones (mane, throat, elbows, breeches, tail, cheeks) per family + `coat.length` |
| `src/kinds/creature-surface.ts` | changed | `:15` fur relief: anisotropic Worley locks advected along flow, amplitude per zone |
| `src/kinds/head-hair.ts`, `head-beard.ts` | changed | hairstyles as card layers over a scalp cap; beard by zone (moustache, chin, cheeks) |
| `recipes/_lib/face/hair*.ts`, `creases-hair.ts` | changed | use cards |
| `recipes/{human,elf,goblin,orc}_head/hair.ts`, `recipes/orc_head/fur.ts` | changed | card hairstyles |
| `src/qa/fur-silhouette.ts` + `.test.ts` | new | `T3D_FUR_SILHOUETTE`: coated vs bare outline roughness per declared zone |

## Depends on
01, 04 (scalp/body meshes), 05 (zones read creature bones). Can start with heads while 05 lands.

## Change
- LOD: LOD0 dense (wolf 2–4k cards), LOD1 ≤ ¼ count, wider, LOD2 none (length folded into the SDF offset).
- Cards are one extra part per body (`fur`, `hair`) on the shared material's cutout strip: one draw.
- QA: cards exempt from `floating-parts`/`gaps` by root-inside proof (root point inside the parent mesh), not by name.

## Tests
Failure first: bald mesh fails `fur-silhouette`; a card root outside the surface fails; flow field divergence-free along a cylinder test.

## Checks
`bun test src/passes/hair-*.test.ts src/material/strands.test.ts src/kinds/creature-fur.test.ts src/qa/fur-silhouette.test.ts` · wolf + 4 heads: build QA PASS, shot + hero READ

## Docs
`docs/research/hair.md`; roadmap :120 :232 (coordinator).

## Done when
Wolf mane/throat/breeches and the head hairstyles read as hair in hero.png; wolf materials + detail ≥ 8 predicted.
