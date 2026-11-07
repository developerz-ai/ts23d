# Material swatches — the trim sheet on a test board

## Identity
Not a real-world object: a labelled board that shows every strip and cell of the shared
procedural trim sheet (`paintTrimSheet`, `DEFAULT_SHEET`), each at true scale. It is the visual
test of the material generator: if a strip's brick courses, plank widths or slate rows read
wrong here, they read wrong on every asset.

## Specs
| Item | Value | Source |
|---|---|---|
| strip panel | 2 m wide × the strip's design height | `src/material/trim-sheet.ts` `scaleMetres` |
| decal / foliage cell | 1 m | `src/material/trim-sheet.ts` |
| strips | plain, brick, stone, slate, iron, wood, glass, concrete | `StripId` |

## Parts
One static board: front plinth (8 strips), raised rear plinth (6 decal + 11 foliage cells),
block-letter labels at LOD0.

## Open questions
None. Build with `--sheet embed` to see textures in a stock viewer.
