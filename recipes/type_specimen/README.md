# Type specimen — every `text()` face on a lettered board

## Identity
Not a real-world object: a free-standing notice board, the shape of a station or museum notice
board, that shows every `TextFont` ts23d ships, each set twice: as flush painted decals (left
column) and as raised cast letters (right column). It is the visual test of `text()`, the way
`material_swatches` tests the trim sheet. Signature features: the serif title, the six specimen
rows, the brass divider, round pen-stroke letters that read cleanly at hero distance, under a
gabled hood on bracketed posts.

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
`posts` (two 0.12 m timber posts and the two back battens the board is bolted through), `board`
(eight tongue-and-groove planks, frame, capping, gabled hood and brackets, divider, carriage bolts
and all lettering merged: one static part, one draw call). No moving parts.

## Wear
`weather()` on the timber: damp and mud at the post feet, moss low on the shaded side, chipped and
sun-bleached frame and hood edges. The paint fades continuously up the top half of the board toward
a chalky grey green (the band the sun reaches under the short hood; each plank's upper edge paler
than its lower), and damp darkens the bottom plank. Close up (LOD0/1), six rain streaks run down
from the capping, darkest under it and gone into the paint at their foot, and the frame's front
arrises are chipped through to grey timber in six places.

## Materials
Raised letters and the divider are polished sign brass (`brass.ts`: roughness 0.16, a trace of
tarnish), so the letter faces catch a highlight; the hood is bitumen roofing felt (`asphalt` strip)
with wooden fascia boards along both eaves (LOD0); carriage bolts with 60 mm square washers fix the
board to the posts (LOD0/1).

## LOD
| LOD | Lettering | Triangles |
|---|---|---|
| 0 | raised brass at 12 mm, `segments: 2`; flush rows at `segments: 1` | ≈ 27.6k |
| 1 | every row flush, `segments: 1` | ≈ 8.5k |
| 2 | greeked: one flat bar per word in its colour (cream left, brass right, title brass), each 90 % of its word so the word breaks stay open; both columns, the title and their rhythm survive | ≈ 280 |

Budget why: a type specimen; twelve rows of real lettering in six faces are the content, and LOD2 (greeked word bars) fits the prop band.

## Open questions
- The vector faces cover printable ASCII only; Cyrillic still needs `'5x7'` or `'block'`.
- Hershey glyphs are pen paths, so letters are uniform-weight strokes (as a sign-writer's brush or
  a plotter pen draws them), not the contrast outlines of a digital serif face.
