# 06 — Head forms: skull planes, neck, orbits, jaw; four heads rebuilt (kinds + recipes)

Rule: a head is skull → planes → muscles → features, held to measured facial proportions; the neck and eyes sit where anatomy puts them.

## Files
| Path | State | Why |
|---|---|---|
| `src/kinds/head.ts`, `head-face.ts`, `head-mesh.ts`, `head-mouth.ts`, `head-bust.ts`, `head-torso.ts`, `head-rim.ts`, `head-tone.ts`, `head-extras.ts`, `head-garb.ts`, `head-armour.ts`, `head.test.ts` | changed | skull + planes stage, neck, orbit depth, skin tone zones |
| `src/kinds/head-planes.ts` + `.test.ts` | new | Asaro-style plane set as `flatten` strokes (04): brow, temple, cheek, mouth barrel, jaw |
| `src/kinds/head-proportions.ts` + `.test.ts` | new | measured checks: eye line at ½ head height, eye width = ⅕ head width, interocular = 1 eye, nose base at ⅔, neck width/head width per race, eyeball 24 mm set ≥ 8 mm behind the brow plane |
| `recipes/_lib/face/*` except `hair*.ts`, `creases-hair.ts` | changed | landmarks, races, skin-ray, paint, teeth, ears use the new stages |
| `recipes/human_head/{build,creases,human_head}.ts`, `README.md` | changed | rebuilt from sourced anthropometry (NASA-STD-3000 / ANSUR II head + neck) |
| `recipes/elf_head/{build,clothes,creases,spec,elf_head}.ts`, `README.md` | changed | same, elf deltas |
| `recipes/goblin_head/{build,clothes,creases,features,spec,goblin_head}.ts`, `README.md` | changed | same, goblin deltas |
| `recipes/orc_head/*` except `hair.ts`, `fur.ts` | changed | same, orc deltas |

## Depends on
01, 03 (predicted score to iterate against), 04.

## Change
- Stages in `head()`: `skull` (cranium + maxilla + mandible masses) → `planes` → `muscles` (masseter, temporalis, orbicularis, zygomaticus, SCM + trapezius into the clavicles) → `features` (eyes in orbits, nose cartilages, lips with vermilion border crease, ears) → `skin` (tone zones: redness at nose/cheeks/ears, blue-grey beard shadow, subsurface-thin zones from 08 thickness map).
- Neck: height and width from anthropometry; SCM from mastoid to sternum; no straight cylinder.
- Eyes: lids wrap the ball, wet line, caruncle (reuse `creature-eye.ts` approach).
- Proportion checks are recipe checks (`T3D_QA_CHECK`) with sources in each README.

## Tests
Failure first: today's human bust fails eye-depth and neck ratio; each race spec passes its own table.

## Checks
`bun test src/kinds/head*.test.ts recipes/*_head/*.test.ts` · per head: `t3d build` QA PASS, `t3d shot` + `hero` + `review` → READ PNGs · `t3d critique` predicted ≥ 8.5 at the end of wave 2 (with 07 + 08)

## Docs
`docs/research/face-base.md`, `head-analysis.md` updated; character-artist skill stage list.

## Done when
Four heads read as believable game-character busts in hero.png; calibrated ≥ 8.5 together with 07/08.
