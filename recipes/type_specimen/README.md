# Type specimen — every `text()` face on a lettered board

## Identity
Not a real-world object: a free-standing notice board, the shape of a station or museum notice
board, that shows every `TextFont` ts23d ships, each set twice: as flush painted decals (left
column) and as raised cast letters (right column). It is the visual test of `text()`, the way
`material_swatches` tests the trim sheet. Signature features: the serif title, the six specimen
rows, the brass divider, round pen-stroke letters that read cleanly at hero distance.

## Specs
| Dimension | Value (m) | Source |
|---|---|---|
| board face | 3.20 × 1.90 | notice-board proportion; chosen so 6 rows at 0.10 m cap height fit |
| board bottom above ground | 0.80 | eye-level notice boards: lettering band 0.9–2.5 m |
| cap height, specimen rows | 0.10 | — |
| cap height, title | 0.16 | — |
| raised letter depth | 0.012 | cast-letter signs stand 6–15 mm proud |

| Face | `font` | Source glyphs | Licence |
|---|---|---|---|
| pixel | `'5x7'`, `'block'` | built-in 5 × 7 LCD character shapes (`src/primitives/font-5x7.ts`) | project code |
| sans | `'sans'` | Hershey Simplex Roman (`futural.jhf`) | Hershey font licence (attribution) |
| serif | `'serif'` | Hershey Complex Roman (`timesr.jhf`) | same |
| script | `'script'` | Hershey Complex Script (`scriptc.jhf`) | same |
| gothic | `'gothic'` | Hershey Gothic English (`gothiceng.jhf`) | same |

The Hershey fonts were originally created by Dr. A. V. Hershey while working at the U. S.
National Bureau of Standards. The format of the font data was originally created by James Hurt,
Cognition, Inc. Files from <https://github.com/kamalmostafa/hershey-fonts>.

## References
| What | URL |
|---|---|
| Hershey fonts, history and styles | https://en.wikipedia.org/wiki/Hershey_fonts |
| Hershey data format (Paul Bourke) | https://paulbourke.net/dataformats/hershey/ |
| `.jhf` files used | https://github.com/kamalmostafa/hershey-fonts/tree/master/hershey-fonts |

## Parts
`posts` (two timber posts), `board` (board, frame, capping, divider and all lettering merged: one
static part, one draw call). No moving parts.

## LOD
Lettering resolution is LOD-gated through `text({ segments })`: 3 / 2 / 1 curve subdivisions per
Hershey segment (LOD0 / 1 / 2). LOD2 keeps the title and the brass column, set flush (12 mm of
relief is a pixel or two at that distance), and drops the cream decals and column headings.

## Open questions
- The vector faces cover printable ASCII only; Cyrillic still needs `'5x7'` or `'block'`.
- Hershey glyphs are pen paths, so letters are uniform-weight strokes (as a sign-writer's brush or
  a plotter pen draws them), not the contrast outlines of a digital serif face.
