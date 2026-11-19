# Material swatches — the trim sheet on a test board

## Identity
Not a real-world object: a labelled board that shows every strip and cell of the shared
procedural trim sheet (`paintTrimSheet`, `DEFAULT_SHEET`), each at true scale. It is the visual
test of the material generator: if a strip's brick courses, plank widths or slate rows read
wrong here, they read wrong on every asset.

## Specs
| Item | Value | Source |
|---|---|---|
| strip panel | one true-scale repeat wide (4 m classic/library/bark, 16 m ground, 32 m rock) × the strip's design height | `stripRect(id).metres`, `DEFAULT_SHEET` `scaleMetres` |
| decal / foliage cell | 1 m | `src/material/trim-sheet.ts` |
| strips | all 42 built-in strips (classic, library, nature) in sheet order | `STRIPS` |
| test ball | Ø 0.36 m, one per strip, in front of its panel | design |
| scale figure | 1.8 m | design |

## Parts
Stepped plinths (`plinth_<row>`, darkened toward the ground), one panel per strip (`strip_<id>`),
one ball per strip in the same strip (`ball_<id>`, LOD0: the strip on curvature, so roughness,
metal and normal read on its highlight), labels (`label_<id>`: flush 5 × 7 letters sized to the
panel at LOD0, one greeked quad at LOD1, none at LOD2), the rear plinth of decal and foliage cells
(`cell_<id>`), and a 1.8 m `figure` at the front row for scale.

## Budget
Budget why: a test card of all 42 trim-sheet strips at true scale (30 × 33 m), each with a label and a test ball; LOD1/2 are boxes only.

≈ 20k / 1.1k / 950 triangles (was 27k / 778 / 778): flush pixel labels cost a fraction of the old
raised block letters, which pays for the 42 balls.

## Open questions
None. Build with `--sheet embed` to see textures in a stock viewer.
